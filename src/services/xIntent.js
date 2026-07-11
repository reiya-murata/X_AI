export function openXReply({ postId, replyText }) {
  const replyUrl = buildXReplyUrl({ postId, replyText });
  window.open(replyUrl, "_blank", "noopener,noreferrer");
  return replyUrl;
}

export function buildXReplyUrl({ postId, replyText }) {
  const id = String(postId || "").trim();
  const text = String(replyText || "").trim();
  if (!/^\d{5,25}$/.test(id) || !text) {
    throw new Error("投稿IDまたは返信文がありません。");
  }
  if (text.length > 280) throw new Error("返信文は280文字以内で入力してください。");

  const params = new URLSearchParams({
    in_reply_to: id,
    text,
  });

  return `https://x.com/intent/tweet?${params.toString()}`;
}
