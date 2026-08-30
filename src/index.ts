import { readdir } from "node:fs/promises";

type SongDirContents = {
  names: string[];
  dirNames: string[];
  wavs: string[];
  rhythms: string[];
};

const songDir = await readdir("src/songs", { recursive: true });
const songs: SongDirContents = {
  names: [],
  dirNames: [],
  wavs: [],
  rhythms: [],
};
songDir.forEach((dir) => {
  if (dir.endsWith(".wav")) songs.wavs.push(dir);
  else if (dir.endsWith(".rhythm")) songs.rhythms.push(dir);
  else {
    songs.names.push(titleCase(dir));
    songs.dirNames.push(dir);
  }
});
songs.names = songs.names.sort();
songs.dirNames = songs.dirNames.sort();
songs.wavs = songs.wavs.sort();
songs.rhythms = songs.rhythms.sort();

const server = Bun.serve({
  port: 3000,
  routes: {
    "/": () => new Response(Bun.file("src/pages/index.html")),
    "/game/:song": () => new Response(Bun.file("src/pages/game.html")),
    "/song-list": async () => {
      return Response.json(songs);
    },
    "/public/*.js": (req) => {
      const url = new URL(req.url);
      return new Response(Bun.file(`.${url.pathname}`));
    },
    "/styles/*.css": genericResource,
    "/assets/*": genericResource,
    "/songs/*": genericResource,
    "/rhythm": {
      POST: async (req) => {
        const body = await req.text();
        const filePath = `dev/take-${new Date().toISOString()}.rhythm`;
        await Bun.write(Bun.file(filePath), body);
        return new Response(`Saved to "${filePath}"`);
      },
    },
  },
});

console.log(`Running on ${server.url}`);

function genericResource(req: Request): Response {
  const url = new URL(req.url);
  return new Response(Bun.file(`src${url.pathname}`));
}

function titleCase(name: string): string {
  return name
    .split("-")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .reduce((prev, cur) => `${prev} ${cur}`);
}
