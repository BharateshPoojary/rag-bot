"use client";
import { MessageCirclePlus } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSelector } from "react-redux";
import { RootState } from "@/lib/store";
import { useRouter } from "next/navigation";
const items = [
  {
    title: "New Chat",
    icon: MessageCirclePlus,
  },
];
export function AppSidebar({ searchparam }: { searchparam: string }) {
  const router = useRouter();
  const { history } = useSelector((state: RootState) => state.chat);

  // Conversations are auto-persisted after each assistant reply (see the chat
  // page), so navigation here no longer needs to save anything — it just moves
  // to a fresh chat or opens an existing one.
  const handleNewChatClick = () => {
    router.replace("/");
  };
  const handleChat = (
    chatIdfromHistory: string,
    specificChatNumber: string
  ) => {
    router.replace(`/c/${chatIdfromHistory}?chatNumber=${specificChatNumber}`);
  };
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem
                  key={item.title}
                  onClick={() => handleNewChatClick()}
                  className="cursor-pointer"
                >
                  <SidebarMenuButton asChild>
                    <span>
                      <item.icon />
                      {item.title}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {history.map((eachuserchat) =>
                eachuserchat.ArrayOfChats.map((eachchat) => (
                  <SidebarMenuItem
                    key={eachchat.chatNumber}
                    className={`${
                      eachchat.chatNumber === searchparam
                        ? "bg-purple-400 rounded-lg hover:bg-purple-500 "
                        : ""
                    }  ${
                      eachuserchat.ArrayOfChats.length > 0
                        ? "cursor-pointer"
                        : ""
                    }`}
                    onClick={
                      eachuserchat.ArrayOfChats.length > 0
                        ? () =>
                            handleChat(eachuserchat.chatId, eachchat.chatNumber)
                        : undefined
                    }
                  >
                    <SidebarMenuButton
                      asChild
                      className={
                        eachchat.chatNumber === searchparam
                          ? "bg-purple-400 text-white hover:bg-purple-500 hover:text-white"
                          : ""
                      }
                    >
                      <div>
                        <div
                          className={`text-sm ${
                            eachchat.chatNumber === searchparam
                              ? "text-white"
                              : "text-gray-500"
                          }`}
                        >
                          {eachchat.messages?.length > 0
                            ? `${eachchat.messages[
                                eachchat.messages.length - 1
                              ].content.slice(0, 20)}...`
                            : "No Chat History Available"}
                        </div>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
