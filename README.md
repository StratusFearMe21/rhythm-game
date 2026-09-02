# Making a Track

Pretty simple process but here are the steps

## Starting the Project

1. Get Bun [here](https://bun.sh)
2. Open a terminal and run `bun i` then `bun run start`
3. Try the "The Good Harvest" since I already finished that one

## Find a Song

First, find a song that you think would be fitting and insert it into `song-data/{song-name-kebab-case}/{song-name-kebab-case}.wav`. Second, alongside the `.wav` put in a `.rhythm` file with the same name as the `.wav` (leave it empty for now).

> There are examples already there if you need them

## Recording Notes

1. Go to `game.ts` under `src/scripts`
2. Set `RECORDING` to `true` to recordyour inputs and `false` to play the game. This requires rebuilding the project.
3. After recording some notes, hit "Enter" whenever to save the recorded notes in `dev/take-{some-datetime}.rhythm`
4. Copy everything in the take file and paste it into the `.rhythm` file for the song.
5. Run `bun run round song-data/{your-song}/{your-song}.rhythm {BPM}` to round all of the notes to the nearest 32nd note. To figure out the BPM, I just used a tempo tapper.
6. Copy the contents of the newly created `rounded.rhythm` file into the song's `.rhythm` file.
7. (Optional) If you don't want a specific note to round, you can put a `+` at the end of the line to tell the round script to ignore it.

## Tips

You can use the `STARTING_AT` variable to change where the song starts, making it useful for testing the song and recording a new section.

You do not have to it all in one go (unless you're cracked). You can record part of the song, set `STARTING_AT` to where you left off, and paste the notes that you just recorded to the end of the song's `.rhythm` file.

All of the recording is entirely vibes based, and I just tapped notes where I thought they should go in the song. There is no right or wrong way of doing it.

**Have fun!**
