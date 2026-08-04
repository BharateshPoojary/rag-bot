import dbConnection from "@/lib/dbConnect";
import { Message } from "@/lib/features/ChatData";
import { ChatModel } from "@/model/Chat";

export async function POST(request: Request) {
  const {
    chatId,
    useremail,
    sidebarChatNumber,
    searchparam,
    messages,
    userType,
  }: {
    chatId: string;
    useremail: string;
    sidebarChatNumber: string;
    searchparam: string;
    messages: Message[];
    userType?: "guest" | "authenticated";
  } = await request.json();

  await dbConnection();

  const existingEmail = await ChatModel.findOne({ useremail });
  if (existingEmail) {
    if (searchparam) {
      console.log("SidebarchatnUmber1", sidebarChatNumber);
      // if user is having email and searchparam both then he is appending new chats
      const existingChatNumber = await ChatModel.findOne({
        useremail,
        ArrayOfChats: { $elemMatch: { chatNumber: sidebarChatNumber } },
      });
      if (existingChatNumber) {
        await ChatModel.updateOne(
          {
            useremail,
            "ArrayOfChats.chatNumber": sidebarChatNumber,
          },
          {
            $push: {
              // $each so each message is appended individually — without it the
              // whole array would be stored as one nested element.
              "ArrayOfChats.$.messages": { $each: messages },
            },
          }
        );
        return Response.json(
          { success: true, message: "Chat  added successfully" },
          { status: 200 }
        );
      }
    }
    console.log("SidebarchatnUmber2", sidebarChatNumber);
    await ChatModel.findOneAndUpdate(
      //if user is not having search param but have email then its a new chat create a new object inside arra of chats
      { useremail },
      {
        $push: {
          ArrayOfChats: {
            chatNumber: sidebarChatNumber,
            messages,
          },
        },
      },
      { new: true }
    );

    return Response.json(
      { success: true, message: "Chat  added successfully" },
      { status: 200 }
    );
  } else {
    //here user is not having search param as well email then its a new user create a new document
    console.log("I am new chat");
    console.log("SidebarchatnUmber1", sidebarChatNumber);
    console.log(sidebarChatNumber, messages);
    console.log("chat Id in db", chatId);
    const saveChat = new ChatModel({
      chatId,
      useremail,
      userType: userType ?? "authenticated",
      ArrayOfChats: [
        {
          chatNumber: sidebarChatNumber,
          messages,
        },
      ],
    });

    await saveChat.save();
    return Response.json(
      { success: true, message: "Chat Data received and saved successfully" },
      { status: 201 }
    );
  }
}
