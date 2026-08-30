async function main() {
  const path = process.argv[2];
  const bpmStr = process.argv[3];
  const feather = process.argv[4] ? parseFloat(process.argv[4]) : 0.133;
  if (!path || !bpmStr) {
    console.error("All required arguments not supplied");
    return;
  }

  const bpm = parseInt(bpmStr) * 8;
  const bps = bpm / 60;

  const result = Bun.file(path);
  const rhythmFile = await result.text();
  const rhythmLineRegex =
    /(\d):\((\d+(?:\.\d+)?,\d+(?:\.\d+)?)\),\((\d+(?:\.\d+)?,\d+(?:\.\d+)?)\)\+?/gm;
  const notes: string[] = [];
  rhythmFile.matchAll(rhythmLineRegex).forEach((match) => {
    const keyIndex = parseInt(match[1]!);

    const startEndSplit = match[3]!.split(",");
    const start = parseFloat(startEndSplit[0]!);
    const end = parseFloat(startEndSplit[1]!);

    const featheredStart = start - feather;
    const featheredEnd = end + feather;
    if (match[0].lastIndexOf("+") < 0) {
      const roundedStart = Math.round(start * bps) / bps;
      let roundedEnd = Math.round(end * bps) / bps;
      if (roundedEnd - roundedStart < 0.0001) roundedEnd += 1 / bps;
      notes.push(
        `${keyIndex}:(${featheredStart},${featheredEnd}),(${roundedStart},${roundedEnd})\n`,
      );
    } else {
      notes.push(
        `${keyIndex}:(${featheredStart},${featheredEnd}),(${start},${end})\n`,
      );
    }
  });

  const savePath = "./rounded.rhythm";
  await Bun.write(
    savePath,
    notes.reduce((prev, cur) => prev + cur),
  );
  console.log(`Saved to ${savePath}`);
}

main();
