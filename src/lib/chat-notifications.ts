export type ChatNotice={conversationId:string;messageId:string;sender:string;group:string|null;body:string;createdAt:string;unread:number};
export function newChatNotices(items:ChatNotice[],seen:Record<string,string>|null,activeConversation:string){
 return seen?items.filter(item=>seen[item.conversationId]!==item.messageId&&item.conversationId!==activeConversation):[];
}
export function chatNoticeLink(conversationId:string){return `/chat?conversation=${encodeURIComponent(conversationId)}`;}
