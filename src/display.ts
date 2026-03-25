import { INDENT, type UserSettings } from './types';

export function buildDisplayContent(params: {
  titleLine: string;
  currentLine: string;
  nextLine: string;
  afterNextLine: string;
  romanizedCurrent: string;
  romanizedNext: string;
  romanizedAfterNext: string;
  settings: UserSettings;
}): string {
  const {
    titleLine,
    currentLine,
    nextLine,
    afterNextLine,
    romanizedCurrent,
    romanizedNext,
    romanizedAfterNext,
    settings,
  } = params;

  const displayLines = [titleLine];

  if (romanizedCurrent) {
    const currentRomanizedSegments = splitForDisplay(romanizedCurrent);
    displayLines.push(`>> ${currentRomanizedSegments[0]}`);

    if (currentRomanizedSegments[1]) {
      displayLines.push(`${INDENT}${currentRomanizedSegments[1]}`);
      displayLines.push(
        settings.showOriginalBelowRomanization
          ? `${INDENT}${currentLine}`
          : `> ${romanizedNext}`,
      );
    } else {
      displayLines.push(
        settings.showOriginalBelowRomanization
          ? `> ${currentLine}`
          : `> ${romanizedNext}`,
      );
      displayLines.push(
        settings.showOriginalBelowRomanization
          ? `${INDENT}${romanizedNext}`
          : `${INDENT}${romanizedAfterNext}`,
      );
    }

    return displayLines.join('\n');
  }

  const currentSegments = splitForDisplay(currentLine);
  displayLines.push(`>> ${currentSegments[0]}`);
  displayLines.push(`${INDENT}${currentSegments[1] ?? `> ${nextLine}`}`);
  displayLines.push(`${INDENT}${currentSegments[1] ? `> ${nextLine}` : afterNextLine}`);
  return displayLines.join('\n');
}

export function buildGapContent(titleLine: string): string {
  return `${titleLine}\n...\n> ...\n${INDENT}...`;
}

function splitForDisplay(text: string, maxLength = 38): [string, string?] {
  if (text.length <= maxLength) {
    return [text];
  }

  const splitAt = text.lastIndexOf(' ', maxLength);
  if (splitAt > Math.floor(maxLength * 0.6)) {
    return [text.slice(0, splitAt), text.slice(splitAt + 1)];
  }

  return [text.slice(0, maxLength), text.slice(maxLength)];
}
