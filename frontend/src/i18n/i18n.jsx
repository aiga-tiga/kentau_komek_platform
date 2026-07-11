import { createContext, useContext, useState } from "react";
import ru from "./ru.json";
import kk from "./kk.json";

const DICTS = { ru, kk };
const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "ru");

  function changeLang(next) {
    setLang(next);
    localStorage.setItem("lang", next);
  }

  const t = (key) => DICTS[lang][key] || key;

  return (
    <LangContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
