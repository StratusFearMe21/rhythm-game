import { Noise } from "noisejs";

type SongDirContents = {
  names: string[];
  dirNames: string[];
  wavs: string[];
  rhythms: string[];
};

export default () => ({
  contents: <SongDirContents>{},
  selected: -1,
  audioSource: <HTMLAudioElement | null>null,

  marchValue: 0,
  backgroundSimplex: Array<number>(25 * 25).fill(0),
  noise: new Noise(),

  async init() {
    setInterval(() => this.animateBackground(), 1000 / 30);

    const result = await fetch("http://localhost:3000/song-list");
    this.contents = await result.json();

    window.addEventListener("keydown", (e) => this.selectTrack(e.key));
  },

  async selectTrack(key: string) {
    const oldSelected = this.selected;
    switch (key) {
      case "ArrowDown":
        this.selected = Math.min(
          this.contents.names.length - 1,
          this.selected + 1,
        );
        break;
      case "ArrowUp":
        this.selected = Math.max(0, this.selected - 1);
        break;
      case "Enter":
        document.location.href = `http://localhost:3000/game/${this.contents.dirNames[this.selected]}`;
        return;
      default:
        return;
    }

    if (this.selected == oldSelected) return;

    this.audioSource?.pause();
    this.audioSource = new Audio(`/songs/${this.contents.wavs[this.selected]}`);
    await this.audioSource.play();
    this.audioSource.currentTime = this.audioSource.duration / 4;
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
