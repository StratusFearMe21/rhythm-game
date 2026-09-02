import { IntervalTree, type DataInterval } from "node-interval-tree";
import { Noise } from "noisejs";

const RECORDING = false;
const STARTING_AT = 174;

const allowedKeysTuple = ["s", "f", "j", "l"] as const;
type AllowedKeys = (typeof allowedKeysTuple)[number];

// key index:(feather start, feather end),(actual start, actual end)
// 0:(0.09563570833270205,0.4168123753340013),(0.19563570833270205,0.31681237533400125)
type KeyRecord = {
  key: AllowedKeys;
  down: number;
  up: number;
};

class Note {
  public index: number;
  public offset: number = 0.0;
  public successDown: boolean = false;
  public successUp: boolean = false;
  public tooEarly: boolean = false;
  public key: number;
  public start: number;
  public end: number;
  private readonly zoom: number;

  public constructor(
    index: number,
    key: number,
    start: number,
    end: number,
    zoom: number,
  ) {
    this.index = index;
    this.key = key;
    this.start = start;
    this.end = end;
    this.zoom = zoom;
  }

  public style(): string {
    const pixelsPerS = 1000;
    const bottom = ((this.start - this.offset) * pixelsPerS) / this.zoom;
    const height = ((this.end - this.start) * pixelsPerS) / this.zoom;
    if (bottom > 1500 || bottom + height < -200) return "display: none;";

    const leftPercent = (this.key / allowedKeysTuple.length) * 100;
    const leftPixels = (50 * this.key) / (allowedKeysTuple.length - 1);
    const background = (): string => {
      if (this.tooEarly) return "var(--error)";
      else if (this.successDown && this.successUp) return "var(--primary)";
      return "var(--common-tint-dark)";
    };
    return `
      bottom: ${bottom}px;
      left: calc(${leftPercent}% + ${leftPixels}px);
      height: ${height}px;
      background-color: ${background()};
    `;
  }
}

type KeyRecordMap = Partial<Record<AllowedKeys, KeyRecord>>;

export default () => ({
  feather: 0.133,
  keyRecordMap: <KeyRecordMap>{},
  allRecords: <string[]>[],
  countdown: 3,
  audioSource: <HTMLAudioElement | null>null,
  confirmedStart: false,
  combo: 1,
  songEnded: false,
  results: {
    accuracy: 0,
    maxCombo: 1,
    points: 0,
  },

  notes: <Note[]>[],
  noteTrees: [
    new IntervalTree<DataInterval<Note>>(),
    new IntervalTree<DataInterval<Note>>(),
    new IntervalTree<DataInterval<Note>>(),
    new IntervalTree<DataInterval<Note>>(),
  ] as const,
  zoom: 3,

  marchValue: 0,
  backgroundSimplex: Array<number>(25 * 25).fill(0),
  noise: new Noise(),

  async init() {
    setInterval(() => this.animateBackground(), 1000 / 30);
    this.notes = await this.getNotes();

    const confirmFn = (e: KeyboardEvent) => {
      this.confirmStart();
      this.confirmedStart = true;
      const path = document.location.pathname;
      const songName = path.slice(path.lastIndexOf("/") + 1);
      this.audioSource = new Audio(`/songs/${songName}/${songName}.wav`);
      this.audioSource.onended = () => this.onEnd(this.notes);
      this.audioSource.currentTime = STARTING_AT;
      this.audioSource.load();
      window.removeEventListener("keydown", confirmFn);
    };
    window.addEventListener("keydown", confirmFn);
  },

  confirmStart() {
    const interval = setInterval(async () => {
      if (this.countdown > 0) {
        this.countdown--;
        return;
      }

      window.addEventListener("keydown", (e) => {
        this.handleDownInput(e.key);
      });
      window.addEventListener("keyup", (e) => {
        this.handleUpInput(e.key);
      });

      await this.audioSource?.play();
      setInterval(() => this.update(this.notes, this.audioSource!));
      this.countdown--;
    }, 1000);

    setTimeout(() => clearInterval(interval), this.countdown * 1000 + 1100);
  },

  onEnd(notes: Note[]) {
    let accuracyPoints = 0;
    const totalAccuracyPoints = notes.length * 2;
    notes.forEach((n) => {
      if (n.tooEarly) return;
      if (n.successDown) accuracyPoints++;
      if (n.successUp) accuracyPoints++;
    });
    this.results.accuracy = accuracyPoints / totalAccuracyPoints;
    this.songEnded = true;
  },

  update(notes: Note[], audioSource: HTMLAudioElement) {
    notes.forEach((n) => (n.offset = audioSource.currentTime));
  },

  handleDownInput(key: string) {
    const downTime = this.audioSource!.currentTime;

    if (RECORDING && key == "Enter") {
      this.uploadRecords();
      return;
    }

    const containsKey = ([...allowedKeysTuple] as string[]).includes(key);
    if (!containsKey) return;

    const actualKey = key as keyof KeyRecordMap;
    const record = this.keyRecordMap[actualKey] as KeyRecord | undefined;
    if (!record) {
      this.keyRecordMap[actualKey] = {
        key: actualKey,
        down: downTime,
        up: 0,
      };
      if (!RECORDING) this.hitNote(this.keyRecordMap[actualKey]);
    }
  },

  handleUpInput(key: string) {
    const upTime = this.audioSource!.currentTime;

    const containsKey = ([...allowedKeysTuple] as string[]).includes(key);
    if (!containsKey) return;

    const actualKey = key as AllowedKeys;
    let record = this.keyRecordMap[actualKey] as KeyRecord | undefined;
    if (record) {
      record.up = upTime;
      if (RECORDING) this.record(record);
      else this.releaseNote(record);
      this.keyRecordMap[actualKey] = undefined;
    }
  },

  record(record: KeyRecord) {
    const keyIndex = allowedKeysTuple.indexOf(record.key);
    const keyRecord = `${keyIndex}:(${record.down - this.feather},${record.up + this.feather}),(${record.down},${record.up})\n`;
    this.allRecords.push(keyRecord);
  },

  hitNote(record: KeyRecord) {
    const keyIndex = allowedKeysTuple.findIndex((p) => p == record.key);
    const note = this.noteTrees[keyIndex]?.search(record.down, record.down)[0];
    if (!note) {
      const earlyNote = this.noteTrees[keyIndex]?.search(
        record.down,
        record.down + 0.5,
      )[0];
      if (earlyNote) {
        earlyNote.data.tooEarly = true;
        this.combo = 1;
      }
      return;
    }

    if (!note.data.tooEarly && record.down <= note.data.start + this.feather) {
      note.data.successDown = true;
      this.results.points += this.combo;
    }
  },

  releaseNote(record: KeyRecord) {
    const keyIndex = allowedKeysTuple.findIndex((p) => p == record.key);
    const note = this.noteTrees[keyIndex]?.search(record.up, record.up)[0];
    if (!note) {
      this.combo = 1;
      return;
    }

    if (note.data.successDown && record.up >= note.data.end - this.feather) {
      note.data.successUp = true;
      this.results.points += 3 * this.combo;
      this.combo++;
      this.results.maxCombo = Math.max(this.results.maxCombo, this.combo);
    } else this.combo = 1;
  },

  isPressing(key: AllowedKeys): boolean {
    return this.keyRecordMap[key] != undefined;
  },

  async getNotes(): Promise<Note[]> {
    const path = document.location.pathname;
    const songName = path.slice(path.lastIndexOf("/") + 1);
    const result = await fetch(
      `http://localhost:3000/songs/${songName}/${songName}.rhythm`,
    );
    if (!result.ok) return [];

    let notes: Note[] = [];
    const rhythmFile = await result.text();
    const rhythmLineRegex =
      /(\d):\((\d+(?:\.\d+)?,\d+(?:\.\d+)?)\),\((\d+(?:\.\d+)?,\d+(?:\.\d+)?)\)\+?/gm;
    rhythmFile.matchAll(rhythmLineRegex).forEach((match, i) => {
      const keyIndex = parseInt(match[1]!);

      const featherdStartEndSplit = match[2]!.split(",");
      const featheredStart = parseFloat(featherdStartEndSplit[0]!);
      const featheredEnd = parseFloat(featherdStartEndSplit[1]!);

      const startEndSplit = match[3]!.split(",");
      const start = parseFloat(startEndSplit[0]!);
      const end = parseFloat(startEndSplit[1]!);

      const newNote = new Note(i, keyIndex, start, end, this.zoom);
      notes.push(newNote);
      this.noteTrees[keyIndex]!.insert({
        data: newNote,
        low: featheredStart,
        high: featheredEnd,
      });
    });
    return notes;
  },

  async uploadRecords() {
    await fetch("http://localhost:3000/rhythm", {
      method: "POST",
      body: this.allRecords.reduce((prev, cur) => prev + cur),
    })
      .then((r) => r.text())
      .then((text) => console.log(text));
    document.location.reload();
  },

  animateBackground() {
    for (let i = 0; i < this.backgroundSimplex.length; i++) {
      const x = i % 25;
      const y = Math.floor(i / 25);
      this.backgroundSimplex[i] =
        (this.noise.simplex2(x, y + this.marchValue) + 1) / 2;
    }

    this.marchValue += 0.005;
  },
});
