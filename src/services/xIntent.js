export function openXReply({ postId, replyText }) {
  const replyUrl = buildXReplyUrl({ postId, replyText });
  window.open(replyUrl, "_blank", "noopener,noreferrer");
  return replyUrl;
}

export function buildXReplyUrl({ postId, replyText }) {
  if (!postId || !replyText.trim()) {
    throw new Error("投稿IDまたは返信文がありません。");
  }

  const params = new URLSearchParams({
    in_reply_to: postId,
    text: replyText.trim(),
  });

  return `https://x.com/intent/tweet?${params.toString()}`;
}
