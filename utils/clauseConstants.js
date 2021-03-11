const romanNumerals = ['I', 'II', "III", 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', "XIX", 'XX']
const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const lowerLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'f', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
const romanettes = romanNumerals.map(numeral => { numeral.toLowerCase() });
const upperLetters = lowerLetters.map(letter => { letter.toUpperCase() });
const subclauseStarts = ['(', '\“'];
const clauseStarts = numbers.join(subclauseStarts);
const subclauseIDs = romanNumerals.concat(numbers, lowerLetters, romanettes, upperLetters);