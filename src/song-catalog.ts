export type SongDirContents = {
  names: string[];
  dirNames: string[];
  wavs: string[];
  rhythms: string[];
};

type SongFiles = {
  wav?: string;
  rhythm?: string;
};

export function buildSongCatalog(keys: Iterable<string>): SongDirContents {
  const songsByName = new Map<string, SongFiles>();

  for (const key of keys) {
    const match = /^([^/]+)\/([^/]+)\.(wav|rhythm)$/.exec(key);
    if (!match || match[1] !== match[2]) continue;

    const name = match[1]!;
    const extension = match[3]! as keyof SongFiles;
    const song = songsByName.get(name) ?? {};
    song[extension] = key;
    songsByName.set(name, song);
  }

  const completeSongs = [...songsByName.entries()]
    .filter((entry): entry is [string, Required<SongFiles>] => {
      const [, files] = entry;
      return files.wav !== undefined && files.rhythm !== undefined;
    })
    .sort(([left], [right]) => left.localeCompare(right));

  return {
    names: completeSongs.map(([name]) => titleCase(name)),
    dirNames: completeSongs.map(([name]) => name),
    wavs: completeSongs.map(([, files]) => files.wav),
    rhythms: completeSongs.map(([, files]) => files.rhythm),
  };
}

export function titleCase(name: string): string {
  return name
    .split("-")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}
