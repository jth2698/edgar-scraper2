const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
// Don't delete, see commented console.log at end of file
const util = require('util');

const scrapeContractURLs = require('./contractURLScraper');
const fetchSECPage = require('../utils/fetch-utils/fetchSECPage');
const bluebird = require('../utils/fetch-utils/bluebird');

const db = require('../models');

let contractData;

// Helper function to read contractData in from the local year_Master JSON file - Was having issues with large file save so reverted to returning data from contractURLScraper
// const getContractData = async (year) => {
//     try {
//         let rawContractData = fs.readFileSync(`${dataDir}/${year}/${year}_Master.json`);
//         let contractData = await JSON.parse(rawContractData);
//         return contractData;
//     }
//     catch (error) { throw error }
// }

// Helper function return the urls from contractURLScraper
const getContractURLs = async (year) => {

    contractData = await scrapeContractURLs(year);

    try {
        let contractURLs = [];
        contractData.forEach(contractObject => { contractURLs.push(contractObject.contractURL) });
        return contractURLs;
    } catch (error) { throw error }
}

// Helper functions

// Tests to see if a string is upper case. Helps in filtering items like 'EXHIBIT A' etc.
const isUpperCase = (string) => { return string === string.toUpperCase() }

// Takes in an array of words and calculates the ratio of uppercase words to total. If more than 66% of the words are uppercase, original string is likely a heading.
const isHeading = (array) => {
    let upper = 0;
    let total = array.length;
    array.forEach(word => { if (isUpperCase(word.charAt(0))) { upper++ } })
    let upperRatio = upper / total;
    if (upperRatio >= .66) { return true } else { return false }
}

const pClauseScraper = async (url) => {

    try {

        const html = await fetchSECPage(url);

        // There is a memory leak issue in cheerio dependency domutils that throws a range error / call stack size error for very large DOMs. Use https://sec.gov/Archives/edgar/data/1355001/000119312510031637/dex1026.htm as an example. The example is about 18,000,000 chars. I am using 10,000,000 chars as a limit for safety. 
        if (html && html.length < 10000000) {

            const $ = cheerio.load(html);

            const numbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            const subclauseStarts = ['(', '\“'];
            const clauseStarts = numbers.join(subclauseStarts);
            const clausePartEnds = ['.', ':', ';', ',', ',', '\”'];
            const lowerLetters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'f', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
            const upperLetters = lowerLetters.map(letter => { letter.toUpperCase() });
            const letters = lowerLetters.join(upperLetters);

            // This is equal to a non-breaking space or '&nbsp;' in html
            const nbSpace = new RegExp(String.fromCharCode(160), "gi");

            let introParaFound = false;

            // All contract content is typically in a 'font' element, so we filter through those to return likely clauses
            let clauseEls = $('font').filter((index, element) => {

                // Clean out breaks, newlines, and non-breaking spaces for purposs of filter.
                let elementText = $(element).text().replace(/\r\n|\n|\r|\s\s+/gm, ' ').replace(nbSpace, ' ').replace(/\s\s+/g, ' ').trim();

                // Return early if letter is detected. Letter formatting is different and will likely retrun trash content.
                if (elementText.indexOf('Dear Mr.') > -1 || elementText.indexOf('Dear Mrs.') > -1 || elementText.indexOf('To Whom It May Concern:') > -1 || elementText.indexOf('Ladies and Gentlemen:') > -1) { return false }

                if (introParaFound === false && (elementText.indexOf('“Agreement”)') > -1 || elementText.indexOf('is entered into') > -1)) { introParaFound = true; return $(element) }

                if (
                    (
                        // This part returns the intro para (including the defined term 'Agreement') and any normal text that starts with a number or a '(' or other likely clause start and ends with a likely clause (or subpart) end
                        (
                            !isUpperCase(elementText)
                            && (clauseStarts.includes(elementText.charAt(0)))
                            && (
                                clausePartEnds.includes(elementText.slice(-1))
                                || elementText.slice(-4) === '; or' || ', or'
                                || elementText.slice(-5) === '; and' || ', and'
                            )
                        )
                        // We also have to return clauses that break over a page. Page breaks are marked by '<p /> <p /> <hr />', so we target the <hr>.
                        || $(element).parent().nextAll().eq(3).is('hr[size="3"][style="COLOR:#999999"][width="100%"][align="CENTER"]') && !elementText.startsWith('[ * ]')
                        || $(element).parent().prev().is('hr[size="3"][style="COLOR:#999999"][width="100%"][align="CENTER"]') && !elementText.startsWith('[ * ]')
                    )

                    // This scraper does not support table clauses
                    && !$(element).parents().is('td')

                    // Finally, we want to clean out elements that start with 3 numbers or more as those are likely addresses, etc.
                    && !elementText.match(/^\d{3,}/)

                    // Also remove "with a copy to"
                    && !elementText.startsWith('To the address') && !elementText.startsWith('With a copy to')

                ) { return $(element) }
            })

            // Clauses will be pushed in as objects in the clauses array and the lastPush and concatTo variables will help target the proper place to concat break text

            let firstPara;
            let clauses = [];
            let lastPush = '';
            let concatTo = '';

            clauseEls.each((index, element) => {

                let elementText = $(element).text().replace(/\r\n|\n|\r/gm, ' ').replace(nbSpace, ' ').replace(/\s\s+/g, ' ').trim();

                // Once we get to the signature page, we stop looping as attachments are more likely to return trash
                if (elementText.indexOf('IN WITNESS WHEREOF') > -1) { return false }

                // Identify the opening para and push into firstPara
                if (!clauses.length && (elementText.indexOf('this “Agreement”)') > -1 || elementText.indexOf('the “Agreement”)') > -1 || elementText.indexOf('(“Agreement”)') > -1 || elementText.indexOf('is entered into') > -1)) { firstPara = elementText };

                // If the element begins with a number, we push a new clause
                if (numbers.includes(elementText.charAt(0)) && elementText.split('.') !== elementText && !elementText.match(/^\d{3,}/)) {

                    let clauseNumber = elementText.split(' ')[0];

                    // This handles a number that ends with a period.
                    if (clauseNumber.slice(-1) === '.') {
                        let number = elementText.split('. ')[0];
                        let fullClause = elementText.split('. ').slice(1).join('. ');
                        // Headings should always end with a period.
                        let _heading = fullClause.split('. ')[0];
                        let _clause = fullClause.split('. ').slice(1).join('. ');


                        // Check to see if clause has a heading. If not, unnecessarily splits first sentence into heading key / value.
                        if (isHeading(_heading.split(' '))) {

                            // Clauses that start with a '(' are likely the first in a group of subclauses and are handled differently"
                            if (!subclauseStarts.includes(_clause.charAt(0))) {
                                clauses.push({ number: number, heading: _heading, clause: _clause });
                                lastPush = 'clause';
                                concatTo = 'clause';
                            }

                            // If the clause starts with a '(', push it into the first subclause spot
                            if (subclauseStarts.includes(_clause.charAt(0))) {
                                let subsection = _clause.split(' ')[0];
                                let fullSubclause = _clause.split(' ').slice(1).join(' ');
                                let __heading = fullSubclause.split('. ')[0];
                                let __subclause = fullSubclause.split('. ').slice(1).join('. ');
                                if (isHeading(__heading.split(' '))) {
                                    clauses.push({ number: number, heading: _heading, clause: '', subclauses: [{ subsection: subsection, heading: __heading, subclause: __subclause }] })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                                else {
                                    clauses.push({ number: number, heading: _heading, clause: '', subclauses: [{ subsection: subsection, subclause: fullSubclause }] })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                            }
                        }

                        // Clauses without headings are treated differently. Full clause pushed into the clause key / value
                        else {

                            if (!subclauseStarts.includes(fullClause.charAt(0))) {
                                clauses.push({ number: number, heading: '', clause: fullClause });
                                lastPush = 'clause';
                                concatTo = 'clause';
                            }

                            if (subclauseStarts.includes(fullClause.charAt(0))) {
                                let subsection = fullClause.split(' ')[0];
                                let fullSubclause = fullClause.split(' ').slice(1).join(' ');
                                let __heading = fullSubclause.split('. ')[0];
                                let __subclause = fullSubclause.split('. ').slice(1).join('. ');
                                if (isHeading(__heading.split(' '))) {
                                    clauses.push({ number: number, heading: '', clause: '', subclauses: [{ subsection: subsection, heading: __heading, subclause: __subclause }] })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                                else {
                                    clauses.push({ number: number, heading: '', clause: '', subclauses: [{ subsection: subsection, subclause: fullSubclause }] })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                            }
                        }
                    }

                    // This handles a number that ends with a space. Otherwise same as above
                    if (numbers.includes(clauseNumber.slice(-1))) {
                        let number = elementText.split(' ')[0];
                        let fullClause = elementText.split(' ').slice(1).join(' ');
                        let heading = fullClause.split('. ')[0];
                        let clause = fullClause.split('. ').slice(1).join('. ');

                        if (!subclauseStarts.includes(clause.charAt(0))) {
                            clauses.push({ number: number, heading: heading, clause: clause });
                            lastPush = 'clause';
                            concatTo = 'clause';
                        }

                        if (subclauseStarts.includes(clause.charAt(0))) {
                            let subsection = clause.split(' ')[0];
                            let fullSubclause = clause.split(' ').slice(1).join(' ');
                            let _heading = fullSubclause.split('. ')[0];
                            let _subclause = fullSubclause.split('. ').slice(1).join('. ');
                            if (isHeading(_heading.split(' '))) {
                                clauses.push({ number: number, heading: heading, clause: '', subclauses: [{ subsection: subsection, heading: _heading, subclause: _subclause }] })
                                lastPush = 'subclause';
                                concatTo = 'subclause';
                            }
                            else {
                                clauses.push({ number: number, heading: heading, clause: '', subclauses: [{ subsection: subsection, subclause: fullSubclause }] })
                                lastPush = 'subclause';
                                concatTo = 'subclause';
                            }
                        }
                    }
                }

                // If clauses exist (numbers have started populating clauses) and an element begins with a subclause start, we push into the subclauses array for the last clause
                else if (clauses.length && subclauseStarts.includes((elementText.charAt(0)))) {

                    let i = clauses.length - 1;

                    // Deals with true subclauses (not definitions in subclauses)
                    if (letters.includes(elementText.charAt(0)) || elementText.charAt(0) === '(') {

                        let subsection = elementText.split(' ')[0].trim();
                        let fullSubclause = elementText.split(' ').slice(1).join(' ').trim();
                        let _heading = fullSubclause.split('. ')[0].trim();
                        let _subclause = fullSubclause.split('. ').slice(1).join('. ').trim();

                        // If no subclauses object has been created yet, create one
                        if (!clauses[i].subclauses) {
                            if (isHeading(_heading.split(' '))) {
                                clauses[i].subclauses = [{ subsection: subsection, heading: _heading, subclause: _subclause }];
                                lastPush = 'subclause';
                                concatTo = 'subclause';
                            }
                            else {
                                clauses[i].subclauses = [{ subsection: subsection, subclause: fullSubclause }];
                                lastPush = 'subclause';
                                concatTo = 'subclause';
                            }
                        }

                        // Otherwise push into current subclauses object.
                        else {

                            let { subclauses } = clauses[i];
                            let x = subclauses.length - 1;
                            let lastSubsectionLetter;
                            if (subclauses[x].subsection && subclauses[x].subsection.length >= 2) { lastSubsectionLetter = subclauses[x].subsection.charAt(1) };
                            let thisSubsectionID = subsection.charAt(1);

                            // Check to see if subclause has a heading
                            if (isHeading(_heading.split(' '))) {
                                // If so and subsection is different than last subsection, push into a new subparts array within the subclause
                                if (
                                    lowerLetters.includes(lastSubsectionLetter)
                                    && (
                                        !lowerLetters.includes(thisSubsectionID)
                                        // Need to add i as an additional condition to the first to avoid '(ii)' being pushed as first subpart under '(i)'
                                        || thisSubsectionID === 'i' && lastSubsectionLetter !== 'h' && lastSubsectionLetter !== 'i'
                                        || thisSubsectionID === 'v' && lastSubsectionLetter !== 'u'
                                        || thisSubsectionID === 'x' && lastSubsectionLetter !== 'w'
                                    )
                                ) {
                                    if (!subclauses[x].subparts) {
                                        subclauses[x].subparts = [{ subpartref: subsection, heading: _heading, subpart: _subclause }];
                                        lastPush = 'subpart';
                                        concatTo = 'subpart';
                                    }
                                    else { subclauses[x].subparts.push({ subpartref: subsection, heading: _heading, subpart: _subclause }) }
                                }
                                // Otherwise, push into the subsection array
                                else {
                                    subclauses.push({ subsection: subsection, heading: _heading, subclause: _subclause })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                            }

                            // Same process but this time no heading is detected within the subsection
                            else {
                                if (
                                    lowerLetters.includes(lastSubsectionLetter)
                                    && (
                                        !lowerLetters.includes(thisSubsectionID)
                                        || thisSubsectionID === 'i' && lastSubsectionLetter !== 'h' && lastSubsectionLetter !== 'i'
                                        || thisSubsectionID === 'v' && lastSubsectionLetter !== 'u'
                                        || thisSubsectionID === 'x' && lastSubsectionLetter !== 'w'
                                    )
                                ) {
                                    if (!subclauses[x].subparts) {
                                        subclauses[x].subparts = [{ subpartref: subsection, subpart: fullSubclause }];
                                        lastPush = 'subpart';
                                        concatTo = 'subpart';
                                    }
                                    else { subclauses[x].subparts.push({ subpartref: subsection, subpart: fullSubclause }) }
                                }
                                else {
                                    subclauses.push({ subsection: subsection, subclause: fullSubclause })
                                    lastPush = 'subclause';
                                    concatTo = 'subclause';
                                }
                            }
                        }
                    }

                    // Deals with definitions in subclauses
                    if (elementText.charAt(0) === '\“') {
                        if (lastPush === 'clause') {
                            clauses[i].subclauses = [{ subsection: '', subclause: elementText }];
                            lastPush = 'subclause-def';
                            concatTo = 'subclause';
                        }

                        if (lastPush === 'subclause-def') {
                            let { subclauses } = clauses[i];
                            subclauses.push({ subsection: '', subclause: elementText })
                            lastPush = 'subclause-def';
                            concatTo = 'subclause';
                        }

                        if (lastPush === 'subclause') {
                            let { subclauses } = clauses[i];
                            let x = subclauses.length - 1;
                            subclauses[x].subparts = [{ subpartref: '', subpart: elementText }]
                            lastPush = 'subpart-def';
                            concatTo = 'subpart';
                        }

                        if (lastPush === 'subpart-def') {
                            let { subclauses } = clauses[i];
                            let x = subclauses.length - 1;
                            subclauses[x].subparts.push({ subpartref: '', subpart: elementText });
                            lastPush = 'subpart-def';
                            concatTo = 'subpart';
                        }
                    }
                }

                // Finally, if the element is not a number or a subclause start, it is likely break text and needs to be appropriately concat-ed to the last clause o rsubclause as applicable
                else if (clauses.length) {
                    let i = clauses.length - 1;
                    if (concatTo === 'clause') { clauses[i].clause = clauses[i].clause.concat(` ${elementText}`) }
                    if (concatTo === 'subclause') {
                        let { subclauses } = clauses[i];
                        let x = subclauses.length - 1;
                        subclauses[x].subclause = subclauses[x].subclause.concat(` ${elementText}`);
                    }
                    if (concatTo === 'subpart') {
                        let { subclauses } = clauses[i];
                        let x = subclauses.length - 1;
                        let { subparts } = subclauses[x];
                        let n = subparts.length - 1;
                        subparts[n].subpart = subparts[n].subpart.concat(` ${elementText}`);
                    }
                }
            })

            // Find the index of the current contract object and push clauses into object
            let contractDataIndex = contractData.findIndex(contractObj => contractObj.contractURL === url);
            contractData[contractDataIndex].firstPara = firstPara;
            contractData[contractDataIndex].clauses = clauses;

            // If on the last index, return contractData
            if (firstPara && clauses) { return contractData };
        }

    } catch (error) { throw error };
}

const scrapePClauses = async (year) => {

    try {

        // First call getContractData to read contractData out of JSON file
        // contractData = await getContractData(year);

        // Then generate the array of urls to pass to bluebird 
        let urls = await getContractURLs(year);
        // Removes any dublicated urls and removes any 'undefined' urls
        urls = [... new Set(urls)].filter(url => url.indexOf('undefined') === -1);

        // If database has already been written, this will remove the queued url db entries to avoid duplication 
        await urls.forEach(url => db.Contract.remove({ contractURL: url }));

        // Chunking the urls into batches for easier processing
        let subqueues = [];
        while (urls.length > 0) { subqueues.push(urls.splice(0, 10)) }

        for (let [i, subqueue] of subqueues.entries()) {

            // Using bluebirdjs so that we can operate on each url async (process one before moving to other and hitting rate limit)
            await bluebird(subqueue, 100, pClauseScraper);

            // bluebird doesn't return anything; it calls pClauseScraper which adds the firstPara and clauses to the contractObj within contractData. Filter out the new contractObjs from the subqueue that otherwise qualify for writing to db.
            let populatedContractData = contractData.filter(result =>
                subqueue.includes(result.contractURL)
                && result.clauses
                && result.clauses.length >= 1
                && result.firstPara !== undefined);

            // Clear any contracts with blank clauses and no subclauses
            populatedContractData.forEach(contractObj => { contractObj.clauses = contractObj.clauses.filter(clauseObj => clauseObj.clause !== '' || contractObj.subclauses && contractObj.subclauses.subsection[0] === '' || '(1)' || '(a)' || '(A)' || '(i') || '(I)' });

            // Insert clean data into database
            db.Contract.insertMany(populatedContractData);
            if (i === subqueues.length - 1) { console.log(`finished last subqueue; wrote ${populatedContractData.length} contracts to db`) }
            else { console.log(`finished ${i + 1} of ${subqueues.length} subqueues; wrote ${populatedContractData.length} contracts to db`) }
        }

        // Keeping this so we can dril down into data if needed
        // console.log(util.inspect(populatedContractData, { showHidden: false, depth: null }));

    } catch (error) { throw error };
};

module.exports = scrapePClauses;
