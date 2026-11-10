// Languages Cleartable is prepared for. The app itself is English only for
// now; this list drives what the AI is told about the user's language, and is
// where a UI language setting will plug in later.
export const LANGUAGES = {
  en: 'English',
  cs: 'Czech',
  fr: 'French',
  de: 'German',
  uk: 'Ukrainian',
  hi: 'Hindi',
};
export const DEFAULT_LANGUAGE = 'en';

// "cs-CZ", "CS", "cs_CZ" → "cs"; anything unsupported → null.
export function normalizeLanguage(tag) {
  const base = String(tag || '').trim().toLowerCase().split(/[-_]/)[0];
  return Object.hasOwn(LANGUAGES, base) ? base : null;
}

// The AI rule every prompt carries. Titles stay in the user's own words and
// language; explanations shown in the app follow the app's language.
export function languageRule(appLanguage = DEFAULT_LANGUAGE) {
  const explain = LANGUAGES[normalizeLanguage(appLanguage) || DEFAULT_LANGUAGE];
  return `LANGUAGE: The user may write in any language (for example Czech, French, German, Ukrainian, Hindi, or a mix such as Hindi with English). Understand dates, weekdays and times in that language. Write task titles, notes, project names and people's names in the SAME language and script the user wrote them in — never translate them to English. Write every "reasoning", "reason", "suggestion" or tip text in ${explain}.`;
}
