// Single editable config. A measured balance point, if available,
// goes in startingContrast (replaces the 0.20 default).
export default {
  amblyopicEye: 'left', // 'left' | 'right'
  startingContrast: 0.2, // strong-eye starting contrast
  weakEyeContrast: 1.0, // fixed — the weak eye always gets full contrast
  backgroundGray: 0x808080,
  sessionMinutes: 25,
  breakIntervalMinutes: 10,
};
