// Creates a standalone question from the chat-history and the current question
export const STANDALONE_QUESTION_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Chat History:
{chat_history}
Follow Up Input: {input}
Standalone question:`; // Template for creating a standalone question from the chat history and input question.

// Actual question you ask the chat and send the response to client
export const QA_TEMPLATE = `You are an enthusiastic AI assistant. Use ONLY the following pieces of context to answer the question at the end.
If the answer is not contained in the context, DO NOT make anything up. Instead reply exactly with: "I couldn't find that in the uploaded PDF. Please try rephrasing your question, or make sure the PDF contains the information you're looking for."
If the question is not related to the context, politely respond that you are tuned to only answer questions about the uploaded PDF.

{context}
If no specific question is asked, provide a concise summary of the PDF instead.
Question: {input}
Helpful answer in markdown:`; // Template for answering a question using context from the retriever.
