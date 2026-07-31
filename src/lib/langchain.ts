import { getVectorStore } from "./gemini-embeddings";
import { getStreamingModel, getNonStreamingModel } from "./llm";
import { STANDALONE_QUESTION_TEMPLATE, QA_TEMPLATE } from "./prompt-template";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

type CallChainArgs = {
  question: string;
  userId: string;
  chatId: string;
  chatHistory: string;
};

function formatChatHistory(chatHistory: string) {
  if (!chatHistory) return [];

  const messages = chatHistory
    .split("\n")
    .map((msg) => msg.trim())
    .filter((msg) => msg !== "");
  return messages.map((msg, index) =>
    index % 2 === 0 ? new HumanMessage(msg) : new AIMessage(msg)
  );
}

// Wraps a fixed message (greetings, errors, "no context found") as a one-chunk
// stream so callChain always returns the same streamable shape as the LLM path.
function stringToStream(text: string): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

export async function callChain({
  question,
  userId,
  chatId,
  chatHistory,
}: CallChainArgs) {
  try {
    console.log("Question:", question);
    console.log("User ID:", userId);
    console.log("Chat ID:", chatId);

    const sanitizedQuestion = question.trim().replace(/\n/g, " ");
    console.log("Sanitized question:", sanitizedQuestion);

    const GREETING_REGEX =
      /^(hi|hello|hey|good (morning|afternoon|evening))[\s!.,]*$/i;
    // const UNRELATED_REGEX = /^(do you know about|tell me about something|what is the weather|who is the president)/i

    if (GREETING_REGEX.test(sanitizedQuestion)) {
      return stringToStream(
        "Hello! How can I assist you with your PDF document?"
      );
    }

    // if (!pdfId) {
    //   console.error("No PDF ID provided");
    //   return {
    //     context: [],
    //     answer:
    //       "Please upload a PDF document first, then ask questions about its content.",
    //   };
    // }

    // if (UNRELATED_REGEX.test(sanitizedQuestion)) {
    //   return {
    //     context: [],
    //     answer:
    //       "I'm designed to answer questions about your uploaded PDF. Please ask something specific about the document content.",
    //   }
    // }

    console.log("Getting vector store...");
    const vectorStore = await getVectorStore();

    if (!vectorStore) {
      console.error("Vector store not available");
      return stringToStream(
        "Sorry, there was an issue accessing the document database. Please try again."
      );
    }

    const formattedChatHistory = formatChatHistory(chatHistory);
    console.log("Formatted chat history:", formattedChatHistory);

    const contextualizeQPrompt = ChatPromptTemplate.fromMessages([
      ["system", STANDALONE_QUESTION_TEMPLATE],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
    ]);

    // Isolate retrieval to THIS user's PDFs in THIS chat. Without this filter
    // the search spans every vector in the index (all PDFs, chats and users),
    // which is why answers leaked across PDFs and across users.
    const retrievalFilter = {
      userId: { $eq: userId },
      chatId: { $eq: chatId },
    };
    console.log("Retrieval filter:", retrievalFilter);

    console.log("Creating history-aware retriever...");
    const historyAwareRetriever = await createHistoryAwareRetriever({
      llm: getNonStreamingModel(),
      retriever: vectorStore.asRetriever(10, retrievalFilter),
      rephrasePrompt: contextualizeQPrompt,
    });
    console.log("History Aware Retriever", historyAwareRetriever);
    console.log("Retrieving documents...");
    const retrievedDocuments = await historyAwareRetriever.invoke({
      input: sanitizedQuestion,
      chat_history: formattedChatHistory,
    });

    console.log("Retrieved documents count:", retrievedDocuments.length);

    // The retriever is filtered by userId + chatId, so an empty result means
    // this chat has no PDF vectors at all — i.e. the user hasn't uploaded one.
    if (!retrievedDocuments || retrievedDocuments.length === 0) {
      console.warn("No PDF vectors found for this chat:", chatId);
      return stringToStream(
        "You haven't uploaded a PDF in this chat yet. Please upload a PDF using the + button, then ask your question about it."
      );
    }

    // const contextMessages = retrievedDocuments.map(
    //   (doc: { pageContent: string }) => new HumanMessage(doc.pageContent)
    // );

    console.log("Creating QA chain...");
    const qaPrompt = ChatPromptTemplate.fromMessages([
      ["system", QA_TEMPLATE],
      new MessagesPlaceholder("context"),
      ["human", "{input}"],
    ]);

    const QAChain = await createStuffDocumentsChain({
      llm: getStreamingModel(),
      prompt: qaPrompt,
    });
    console.log("Retrieved Docs", retrievedDocuments);
    console.log("Streaming QA chain...");

    // Stream the answer token-by-token. Retrieval above already finished, so
    // only the LLM generation streams — which is what the user sees appear
    // progressively in the UI.
    const stream = await QAChain.stream({
      context: retrievedDocuments,
      input: sanitizedQuestion,
    });

    return stream;
  } catch (error) {
    console.error("Error in callChain:", error);

    if (error instanceof Error) {
      if (error.message.includes("vector store")) {
        return stringToStream(
          "There was an issue accessing the document database. Please ensure your PDF was uploaded successfully."
        );
      }
      if (error.message.includes("retriever")) {
        return stringToStream(
          "I couldn't retrieve relevant information from your PDF. Please try a different question."
        );
      }
    }

    return stringToStream(
      "I encountered an unexpected error. Please try again or rephrase your question."
    );
  }
}
