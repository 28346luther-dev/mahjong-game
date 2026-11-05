export async function onRequestPost(context) {
  // Generate a simple 6-character room code
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  return new Response(
    JSON.stringify({
      success: true,
      roomCode: roomCode,
      message: "Room created successfully"
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

// Handle browser pre-flight checks
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}