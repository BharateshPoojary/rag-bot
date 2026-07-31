import Balancer from "react-wrap-balancer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const convertNewLines = (text: string) =>
  text.split("\n").map((line, i, arr) => (
    <span key={i}>
      {line}
      {i < arr.length - 1 && <br />}
    </span>
  ));

export function ChatLine({
  role = "assistant",
  content,
  showCursor = false,
}: {
  role: string;
  content: string;
  showCursor?: boolean;
}) {
  // Render even with empty content while the cursor is showing, so the
  // "thinking" dot appears before the first token arrives.
  if (!content && !showCursor) {
    return null;
  }
  const formattedMessage = convertNewLines(content);

  return (
    <div>
      <Card className="mb-2">
        <CardHeader>
          <CardTitle
            className={
              role != "assistant"
                ? "text-amber-500 dark:text-amber-200"
                : "text-blue-500 dark:text-blue-200"
            }
          >
            {role == "assistant" ? "AI" : "You"}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-md">
          <Balancer>
            {formattedMessage}
            {showCursor && (
              <span className="ml-1 inline-block h-3 w-3 rounded-full bg-purple-500 align-middle animate-pulse" />
            )}
          </Balancer>
        </CardContent>
      </Card>
    </div>
  );
}
