import en from "./lang/en.js";
import ru from "./lang/ru.js";
import uk from "./lang/uk.js";
import kk from "./lang/kk.js";
import pl from "./lang/pl.js";
import cs from "./lang/cs.js";
import sk from "./lang/sk.js";
import fr from "./lang/fr.js";
import de from "./lang/de.js";
import it from "./lang/it.js";
import es from "./lang/es.js";
import pt from "./lang/pt.js";

export const DEFAULT_LOCALE = "en";

export const LOCALES = {
  en: { name: "English", strings: en },
  ru: { name: "Русский", strings: ru },
  uk: { name: "Українська", strings: uk },
  kk: { name: "Қазақша", strings: kk },
  pl: { name: "Polski", strings: pl },
  cs: { name: "Čeština", strings: cs },
  sk: { name: "Slovenčina", strings: sk },
  fr: { name: "Français", strings: fr },
  de: { name: "Deutsch", strings: de },
  it: { name: "Italiano", strings: it },
  es: { name: "Español", strings: es },
  pt: { name: "Português", strings: pt },
};
