import { embedAndStoreDocs } from "@/lib/gemini-embeddings";
import { getChunkedDocsFromPDF } from "@/lib/pdf-processor";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // Scope every uploaded PDF to the requesting user. A signed-in user is
    // scoped by their trusted Clerk userId; a guest (auth is optional) sends a
    // session guestId used for the same vector-store scope. One is required.
    const { userId } = await auth();

    const formData = await req.formData();
    const uploadedFile = formData.get("pdfFile");
    const pdfId = formData.get("pdfId");
    const chatId = formData.get("chatId");
    const guestId = formData.get("guestId") as string | null;
    const effectiveUserId = userId ?? (guestId || null);
    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }
    if (uploadedFile) {
      console.log("Uploaded File", uploadedFile);
      const pdfFile = uploadedFile as File;

      const chunkedDocs = await getChunkedDocsFromPDF(
        pdfFile,
        pdfId as string,
        effectiveUserId,
        chatId as string
      );

      if (chunkedDocs) {
        console.log("Chunked Docs", chunkedDocs);
        await embedAndStoreDocs(chunkedDocs);
      }
      return NextResponse.json(
        {
          success: true,
          message: "File Uploaded Successfully",
        },
        {
          status: 200,
        }
      );
    }
  } catch (error) {
    console.error("Internal server error ", error);
    if (error instanceof Error) {
      return NextResponse.json(
        { success: false, message: error.message },
        {
          status: 500,
        }
      );
    }
    return NextResponse.json(
      {
        success: false,
        message: "Error: Something went wrong while uploading. Try again!",
      },
      {
        status: 500,
      }
    );
  }
}
