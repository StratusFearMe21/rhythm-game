import Alpine from "alpinejs";
import svgs from "./svgs";
import game from "./game";
import selectSong from "./select-song";

Alpine.data("svgs", svgs);
Alpine.data("game", game);

Alpine.data("selectSong", selectSong);

Alpine.start();
