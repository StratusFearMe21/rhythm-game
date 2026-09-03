import { InvalidSongObjectKeyError, SongStorage } from "./song-storage";
import indexHTML from "./pages/index.html";
import gameHTML from "./pages/game.html";

const songStorage = SongStorage.fromEnvironment();

const server = Bun.serve({
  port: Number(Bun.env["PORT"] ?? Bun.env["FUNCTIONS_CUSTOMHANDLER_PORT"] ?? 3000),
  routes: {
    "/": indexHTML,
    "/index.html": indexHTML,
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
    "/songs/*": async (req) => {
      try {
        const pathname = new URL(req.url).pathname;
        const key = decodeURIComponent(pathname.slice("/songs/".length));
        return Response.redirect(await songStorage.getSignedSongUrl(key), 302);
      } catch (error) {
        if (error instanceof InvalidSongObjectKeyError || error instanceof URIError) {
          return new Response("Invalid song path", { status: 400 });
        }
        console.error("Unable to sign song URL", error);
        return new Response("Song storage is unavailable", { status: 502 });
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
