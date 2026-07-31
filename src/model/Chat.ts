import mongoose, { Schema, Document } from "mongoose";

export interface Message {
  id: string;
  role: "assistant" | "user";
  content: string;
}

const MessageSchema = new Schema<Message>({
  id: { type: String },
  role: { type: String },
  content: { type: String },
});

export interface ChatItem {
  chatNumber: string;
  messages: Message[];
}
const ChatItemSchema = new Schema<ChatItem>({
  chatNumber: { type: String },
  messages: [MessageSchema],
});
export interface Chat extends Document {
  chatId: string;
  useremail: string;
  userType: "guest" | "authenticated";
  ArrayOfChats: ChatItem[];
}

const ChatSchema = new Schema<Chat>(
  {
    chatId: { type: String, required: true },
    useremail: { type: String, required: true },
    // Distinguishes ephemeral guest sessions from registered users. Guest
    // documents are still persisted, but a returning guest gets a brand-new
    // identity so they never load these back.
    userType: {
      type: String,
      enum: ["guest", "authenticated"],
      default: "authenticated",
    },
    ArrayOfChats: { type: [ChatItemSchema], default: [] },
  },
  { timestamps: true }
);

export const ChatModel =
  mongoose.models.Chat || mongoose.model<Chat>("Chat", ChatSchema);
