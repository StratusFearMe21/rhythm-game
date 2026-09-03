import { SongStorage } from "./song-storage";
import indexHTML from "./pages/index.html";
import gameHTML from "./pages/game.html";

const songStorage = SongStorage.fromEnvironment();

const server = Bun.serve({
  port: Number(Bun.env["PORT"] ?? Bun.env["FUNCTIONS_CUSTOMHANDLER_PORT"] ?? 3000),
  routes: {
    "/": indexHTML,
    "/game/:song": gameHTML,
    "/song-list": async () => {
      try {
        return Response.json(await songStorage.getCatalog());
      } catch (error) {
        console.error("Unable to list songs from S3", error);
        return Response.json(
          { error: "Song storage is unavailable" },
          { status: 502 },
        );
      }
    },
    "/songs/*": (req) => {
      try {
        const pathname = new URL(req.url).pathname;
        const key = decodeURIComponent(pathname.slice("/songs/".length));
        return Response.redirect(songStorage.getPublicSongUrl(key), 302);
      } catch {
        return new Response("Invalid song path", { status: 400 });
      }
    },
    "/rhythm": {
      POST: async (req) => {
        const body = await req.text();
        const key = await songStorage.saveRecording(body);
        return new Response(`Saved to "${key}"`);
      },
    },
  },
});

console.log(`Running on ${server.url}`);
