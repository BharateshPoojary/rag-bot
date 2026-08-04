import { NextRequest, NextResponse } from "next/server";
import { callChain } from "@/lib/langchain";
import { Message } from "@/model/Chat";
import { auth } from "@clerk/nextjs/server";
import { LangChainAdapter } from "ai";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    const { messages, data } = await req.json();
    console.log("Data", data);
    const chatId = data?.chatId as string;

    // Auth is optional. A signed-in user is scoped by their trusted Clerk
    // userId; a guest sends a session guestId which we use for the same
    // retrieval scope. One of the two must be present.
    const guestId = data?.guestId as string | undefined;
    const effectiveUserId = userId ?? (guestId || null);
    if (!effectiveUserId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }
    if (!chatId) {
      return NextResponse.json(
        { success: false, message: "Missing chat id" },
        { status: 400 }
      );
    }
    const formattedPreviousMessages = messages
      .slice(0, -1) //0 means starting element and -1 means ending element but slice method will not consider last element it will exclude last element and consider only remaining element
      .map((eachmessage: Message) => eachmessage.content?.trim()) //trimming each message to remove white spaces
      .filter((content: Message) => content); //It will only consider true value removing falsy value
    const question =
      messages.length > 0 ? messages[messages.length - 1].content?.trim() : ""; //the question the user has asked now the last element from the messages array
    console.log("Question", question);
    console.log("Formatted Previous Message", formattedPreviousMessages);
    try {
      const stream = await callChain({
        question,
        userId: effectiveUserId,
        chatId,
        chatHistory: formattedPreviousMessages.join("\n"), //joining the  array elements which contain previous messages with /n
      }); //sending the question and chathistory to call chain for processing
      // Return the token stream in the AI SDK data-stream protocol so the
      // frontend's useChat() renders the answer progressively as it arrives.
      return LangChainAdapter.toDataStreamResponse(stream);
    } catch (error) {
      console.error("Internal server error ", error);
      return NextResponse.json("Error: Something went wrong. Try again!", {
        status: 500,
      });
    }
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return NextResponse.json({ error: "Failed to parse PDF" }, { status: 500 });
  }
}
