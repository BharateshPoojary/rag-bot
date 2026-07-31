import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

export async function getChunkedDocsFromPDF(
  file: File,
  pdfId: string,
  userId: string,
  chatId: string
) {
  try {
    const loader = new PDFLoader(file); //creating a new instance of pdf loader class which inherits some other parent classes and this class includes a method named load() using which we will extract text from document
    //It takes the file object as argument which includes our file size and other data bytes required for extraction
    const docs = await loader.load(); //Its an asynchronous approach where we will use load method to extract the text from pdf and the whole document text is  stored as an array of object with the key pageContent
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    }); //creating a new instance of textSplitter with argument chunksize it represent how many charcter need to be stored in a single document object
    //chunkOverlap is used to maintain the context It will consider 200 character from previous document and will add to the new doucment so that each chunk we can maintain the context between each chunked document
    // console.log("Document before chunking", docs);
    const chunkedDocs = await textSplitter.splitDocuments(docs); //textSplitter is having  splitDocuments method which will split the documents in chunks as per we specified in argument and once splitted it will return an array of Document which contain chunk objects
    const docswithPdfId = chunkedDocs.map((doc) => ({
      ...doc,
      metadata: {
        ...doc.metadata,
        pdfId,
        userId,
        chatId,
      },
    }));
    console.log("Document after docs with pdf Id", docswithPdfId);
    return docswithPdfId; //returning it so we can embed and store in our pinceconedb so that our llm can use that
  } catch (error) {
    if (error) {
      throw new Error("PDF Chunking Failed");
    }
  }
}
