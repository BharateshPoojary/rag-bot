import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";

// Lazily create the Pinecone client on first use rather than at module load.
// The Pinecone constructor validates PINECONE_API_KEY immediately, but that env
// var isn't present during `next build` (it's a runtime-only secret). Creating
// the client at import time would therefore crash the build when Next collects
// route data. Memoised so we still reuse a single client at runtime.
let pc: Pinecone | null = null;
function getPineconeClient() {
  if (!pc) {
    pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
  }
  return pc;
}
export async function embedAndStoreDocs( // @ts-expect-error docs type error
  chunkedDocs: Document<Record<string, string>>[] //this function will accept array of Documents i.e array of chunked docs which  we made using text splitter
) {
  try {
    const index = getPineconeClient().index("bharat-llm"); // Accesses a Pinecone index named "bharat-llm" An index in Pinecone is similar to a collection or table where vector embeddings are stored and searched.
    const embeddings = new GoogleGenerativeAIEmbeddings({
      //Creates an instance for generating embeddings using the Gemini model.
      modelName: "gemini-embedding-001", // Specifies the model name for embedding generation.
      taskType: TaskType.RETRIEVAL_DOCUMENT, //this indicate the type of task the embeddings will be used RETRIEVAL_DOCUMENT means this will be used for matching or retrieving the document based on similarity like  RETRIEVAL_DOCUMENT helps generate embeddings optimized for finding the most relevant document based on a query.
      // title: "Document title",/title provides context or metadata about the content being embedded. It can help model to improve the quality of embeddings It is optional
      apiKey: process.env.GEMINI_API_KEY as string, //passing the gemini api key
    });

    await PineconeStore.fromDocuments(chunkedDocs, embeddings, {
      //creating  a new pinecone store from documents this also consider emdedding model for storing vector emdedding  for documents here we are also giving index name where this embeddings will be stored
      // You can think as Pineconestore includes fromDocuments method which converts the chunkeddocs into embeddings and stored in vector db
      //chunked docs is the array of docs to be embedded
      //embeddings The embeddings generator.
      pineconeIndex: index, //The target Pinecone index where the embeddings will be stored.
      textKey: "text", //The key in the document object that holds the text content.
    });
    //This above method will return a vector store which as .asRetriever method Its return value can be used as value for retriever option in chain os that to query relevant document
    console.log("Embed stored successfully");
  } catch (error) {
    if (error) {
      throw new Error("Error while generating embeds");
    }
  }
}
// Returns vector-store handle to be used a retrievers on langchains
export async function getVectorStore() {
  try {
    const embeddings = new GoogleGenerativeAIEmbeddings({
      modelName: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      title: "Document title",
      apiKey: process.env.GEMINI_API_KEY as string,
    }); //This is the embedding model which we are using
    const index = getPineconeClient().index("bharat-llm"); //This is the index which we need
    await new Promise((resolve) => setTimeout(resolve, 500)); // Add a small delay This is likely added to avoid rate-limiting issues or to ensure the index is ready before proceeding.
    //To get the store which has embeddings
    const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      //It creates a new pinecone store  instance  which will be created using  existing pinecone index now this store can be used to get or to search for query embeddings
      pineconeIndex: index, //The index which whose store instance we have to create
      textKey: "text", //text is the key which includes the textcontent
    });

    return vectorStore; //returning the vector store so that we can use in our chain
  } catch (error) {
    console.log("error ", error);
    throw new Error("Something went wrong while getting vector store !");
  }
}
