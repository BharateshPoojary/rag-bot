// Guest identity helper.
//
// A guest gets a synthetic id that stands in for BOTH identifiers the app uses:
// the Clerk userId (vector-store scoping in Pinecone) and the Mongo `useremail`.
// It is kept in sessionStorage so it stays stable for the current browsing
// session — PDF uploads, RAG retrieval and the in-session sidebar all need the
// same id — but a fresh visit (new tab/window) starts a brand-new guest, so a
// returning guest never sees the conversations from a previous visit.

const GUEST_ID_KEY = "guestId";

export function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let guestId = sessionStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`;
    sessionStorage.setItem(GUEST_ID_KEY, guestId);
  }
  return guestId;
}
