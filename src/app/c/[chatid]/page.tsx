"use client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import axios, { AxiosError } from "axios";
import { Message, useChat } from "@ai-sdk/react";
import { ChatLine } from "@/components/chat-line";

import { scrollToBottom } from "@/lib/utils";
import { useParams, useSearchParams } from "next/navigation";
import { setChatId } from "@/lib/features/ChatData";
import { useDispatch } from "react-redux";
import { Chat, setHistory } from "@/lib/features/Chat";
import { SignedIn, SignedOut, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { ApiResponse } from "@/types/ApiResponse";
import { getGuestId } from "@/lib/guest";

const ChatInput = () => {
  const { isLoaded, isSignedIn, user } = useUser();

  // Auth is optional. Once Clerk has loaded and there's no session, we mint a
  // per-session guest id (see lib/guest) that stands in for the user's email in
  // Mongo and for the Clerk userId in the vector store.
  const [guestId, setGuestId] = useState<string>("");
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setGuestId(getGuestId());
    }
  }, [isLoaded, isSignedIn]);

  const isGuest = isLoaded && !isSignedIn;
  let userEmail: string = "";
  if (isSignedIn) {
    console.log("User", user.emailAddresses[0].emailAddress);
    userEmail = user.emailAddresses[0].emailAddress;
  } else {
    userEmail = guestId;
  }
  const userType: "guest" | "authenticated" = isSignedIn
    ? "authenticated"
    : "guest";

  const dispatch = useDispatch();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  // Message ids already saved to the DB for this chat. Kept in a ref so the
  // auto-persist effect writes each message exactly once (no duplicate sidebar
  // entries). It naturally resets when the component remounts on navigation to
  // a different chat.
  const persistedIds = useRef<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const params = useParams<{ chatid: string }>();
  const searchParams = useSearchParams();
  let search: string | null = null;
  if (searchParams.get("chatNumber")) {
    search = searchParams.get("chatNumber");
    // console.info("I need", search);
  }
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    setMessages,
    status,
  } = useChat();
  //useChat from vercel ai sdk manages message state and streams the assistant
  //reply into `messages` token-by-token (the server returns the AI SDK data
  //stream protocol), so the UI updates live as the answer is generated.
  // useEffect(() => {
  //   console.log("File Id", fileId)
  // }, [fileId])
  //here using useUser directly get user email and get its chat only like this authentiaction flow will be there
  
  // Refresh the sidebar's conversation list from the DB. Shared by the mount
  // effect and the auto-persist effect (so a newly saved exchange appears in the
  // sidebar immediately).
  const refreshHistory = useCallback(async () => {
    if (!userEmail) return;
    try {
      const result = await axios.post("/api/getHistory", {
        useremail: userEmail,
      });
      dispatch(setHistory(result.data.history as Chat[]));
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse>;
      toast.error(axiosError.response?.data.message ?? "Something went wrong");
    }
  }, [userEmail, dispatch]);

  useEffect(() => {
    console.log("I am inside useEffect");
    dispatch(setChatId(params.chatid));
    console.log("params.chatId", params.chatid);
    // Wait until we have an identity (a real email, or a minted guest id).
    // A returning guest gets a fresh id, so history queries come back empty and
    // they never see a previous visit's conversations.
    if (!userEmail) return;
    refreshHistory();
    const handleChat = async () => {
      try {
        const getChat = await axios.post("/api/getchat", {
          useremail: userEmail,
        });
        const Chats: Chat = getChat.data.chats;
        if (Chats) {
          Chats.ArrayOfChats.map((eachchat) => {
            if (eachchat.chatNumber === search) {
              // Mark already-saved messages as persisted BEFORE loading them, so
              // the auto-persist effect never mistakes them for new and re-saves.
              eachchat.messages.forEach((m) => persistedIds.current.add(m.id));
              setMessages(eachchat.messages);
            }
          });
        }
      } catch (error) {
        const axiosError = error as AxiosError<ApiResponse>;
        toast.error(
          axiosError.response?.data.message ?? "Something went wrong"
        );
      }
    };
    handleChat();
  }, [dispatch, setMessages, params.chatid, search, userEmail, refreshHistory]);

  // Keep the view pinned to the newest content as it streams in.
  useEffect(() => {
    setTimeout(() => scrollToBottom(containerRef), 100);
  }, [messages]);

  // Auto-persist each completed exchange straight to the DB. While streaming,
  // useChat rewrites the last message on every token, so we wait for
  // status === "ready" (request fully finished) before saving — otherwise we'd
  // store partial text. persistedIds (a ref) tracks what's already saved so a
  // conversation is written exactly once and every new reply appends to the
  // SAME conversation instead of creating a duplicate sidebar entry.
  useEffect(() => {
    if (status !== "ready") return;
    if (!userEmail) return;
    const newMessages = messages.filter((m) => !persistedIds.current.has(m.id));
    if (newMessages.length === 0) return;
    newMessages.forEach((m) => persistedIds.current.add(m.id));

    // A stable id for THIS conversation: the chatNumber when continuing an
    // existing chat, otherwise the chat's URL id for a brand-new one.
    const conversationNumber = search ?? params.chatid;
    const persist = async () => {
      try {
        await axios.post("/api/savechat", {
          chatId: params.chatid,
          useremail: userEmail,
          sidebarChatNumber: conversationNumber,
          // searchparam forces savechat's append-to-existing path so replies
          // accumulate in one conversation.
          searchparam: conversationNumber,
          messages: newMessages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
          userType,
        });
        await refreshHistory();
      } catch (error) {
        // Un-mark so the next ready tick retries the save.
        newMessages.forEach((m) => persistedIds.current.delete(m.id));
        const axiosError = error as AxiosError<ApiResponse>;
        toast.error(
          axiosError.response?.data.message ?? "Failed to save chat"
        );
      }
    };
    persist();
  }, [
    status,
    messages,
    search,
    params.chatid,
    userEmail,
    userType,
    refreshHistory,
  ]);

  const [isPDFUploading, setisPDFUploading] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast("Maximum PDF file size must be 2 MB");
      return;
    }

    setFileInfo({
      name: file.name,
      size: file.size,
    });
    const generateFileId = Date.now().toString() + file.name;
    try {
      setisPDFUploading(true);
      const formPDFData = new FormData();
      formPDFData.append("pdfFile", file);
      formPDFData.append("pdfId", generateFileId);
      formPDFData.append("chatId", params.chatid);
      // Guests have no Clerk userId; send the session guest id so the server can
      // scope the PDF's vectors to them (mirrors the /api/chat request below).
      if (isGuest) formPDFData.append("guestId", guestId);
      const pdfUploadResponse = await axios.post("/api/upload", formPDFData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      if (pdfUploadResponse.data) {
        toast("File uploaded successfully");
      }
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse>;
      toast.error(axiosError.response?.data.message ?? "Something went wrong");
    } finally {
      setisPDFUploading(false);
    }
  };

  // Every send must carry the chatId so the server can scope retrieval to the
  // PDFs uploaded in this chat (see /api/chat + langchain retrieval filter).
  const submitWithChatId = (e: React.FormEvent) =>
    handleSubmit(e, {
      data: { chatId: params.chatid, ...(isGuest ? { guestId } : {}) },
    });

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim()) return;
      try {
        submitWithChatId(e); // handleSubmit should handle the server request
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    }
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleSend = () => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };
  function Header() {
    const { signOut } = useClerk();
    return (
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: 20,
        }}
      >
        <h1 className="font-bold text-lg ">AskPDF</h1>
        <SignedOut>
          <Link href="/sign-in">
            <Button className="w-20 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-200 shadow-md hover:shadow-lg">
              Sign in
            </Button>
          </Link>
        </SignedOut>
        <SignedIn>
          <Button
            className="w-20 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-200 shadow-md hover:shadow-lg"
            onClick={async () => {
              try {
                setIsLoading(true);
                await signOut();
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Something went wrong"
                );
              } finally {
                setIsLoading(false);
              }
            }}
          >
            {isLoading ? <Loader className="animate-spin" /> : "Sign Out"}{" "}
          </Button>
        </SignedIn>
      </header>
    );
  }

  return (
    <SidebarProvider>
      {/* Highlight the conversation currently open: the chatNumber when
          continuing an existing chat, else the fresh chat's URL id (which is
          what auto-persist saves it under). */}
      <AppSidebar searchparam={search ?? params.chatid} />
      <main className="w-full">
        <SidebarTrigger />
        <Header />
        <div className="flex flex-col " style={{ height: "calc(100% - 20px)" }}>
          <div className="p-6 overflow-y-auto flex-1 " ref={containerRef}>
            {messages.map(({ id, role, content }: Message, index) => (
              <ChatLine
                key={id}
                role={role}
                content={content}
                // While streaming, the pulsing purple cursor follows the end of
                // the last (assistant) message like ChatGPT.
                showCursor={
                  status === "streaming" &&
                  index === messages.length - 1 &&
                  role === "assistant"
                }
              />
            ))}
            {/* Before the first token arrives, show a standalone "thinking" dot. */}
            {status === "submitted" && (
              <ChatLine role="assistant" content="" showCursor />
            )}
          </div>

          <div className="w-full sm:w-1/2 bg-white p-2 border-t mx-auto sticky bottom-0">
            <div className="flex items-end gap-2 border rounded-xl p-2 bg-background">
              <Button
                onClick={() => uploadRef.current?.click()}
                size="icon"
                className=" p-2 cursor-pointer bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-200 shadow-md hover:shadow-lg"
              >
                {isPDFUploading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Plus className="w-5 h-5" />
                )}
              </Button>

              <input
                disabled={isPDFUploading}
                ref={uploadRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
              />

              <form onSubmit={submitWithChatId} className="flex w-full">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  className="w-full resize-none overflow-y-auto border-none outline-none bg-transparent"
                  style={{
                    maxHeight: "200px",
                  }}
                  onInput={(e) => {
                    e.currentTarget.style.height = "auto";
                    e.currentTarget.style.height = `${Math.min(
                      e.currentTarget.scrollHeight,
                      200
                    )}px`;
                  }}
                />
                <div className="flex items-end">
                  <Button
                    disabled={
                      isPDFUploading || status === "submitted" || !input.trim()
                    }
                    type="submit"
                    size="icon"
                    className=" p-2 cursor-pointer bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white transition-all duration-200 shadow-md hover:shadow-lg"
                    onClick={handleSend}
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </form>
            </div>

            {/* Display file info */}
            {fileInfo && (
              <div className="mt-2 bg-gray-100 p-2 rounded-lg text-sm">
                <p>{fileInfo.name}</p>
                <p>{(fileInfo.size / 1024).toFixed(2)} KB</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
};

export default ChatInput;
