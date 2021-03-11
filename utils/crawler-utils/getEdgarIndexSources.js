const fsRecursive = require('fs-readdir-recursive');
const path = require('path');
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const { once } = require('events');

const dataDir = path.resolve('./data');
const edgarIndexData = [];

const getIndexSources = async (year) => {
    try {
        let indexFiles = fsRecursive(`${dataDir}/${year}`);
        return indexFiles;
    } catch (error) { throw error }
}

const getEdgarIndexSources = async (year) => {

    console.log('getEdgarIndexSources running on year ' + year)

    try {

        let indexFiles = await getIndexSources(year);

        const validForms = ['10-K', '10-Q', '8-K'];
        const href = 'https://www.sec.gov/Archives';

        for (const file of indexFiles) {
            try {

                const rl = createInterface({
                    input: createReadStream(`${dataDir}/${year}/${file}`),
                    crlfDelay: Infinity
                });
                rl.on('line', line => {
                    // Only parse line if begins with a number (cik) - use ^ in regex
                    if (line.match(/^[0-9]/g)) {
                        line = line.split('|');
                        let formType = line[2];
                        let indexURLParts = line[4].split('/');
                        // form of edgar index url is href/edgar/data/cik/file number without '-'/file number with '-' with .txt replaced with -index.html
                        let indexURL = `${href}/${indexURLParts[0]}/${indexURLParts[1]}/${indexURLParts[2]}/${indexURLParts[3].replace(/-/g, '').replace('.txt', '')}/${indexURLParts[3].replace('.txt', '-index.html')}`
                        if (validForms.includes(formType)) {
                            edgarIndexData.push({
                                cik: parseInt(line[0]),
                                companyName: line[1],
                                formType: formType,
                                dateFiled: line[3],
                                indexURL: indexURL
                            });
                        }
                    }
                });

                // Await needs to be placed on the .once method to prevent function from returning without data. See async / await example here https://nodejs.org/api/readline.html#readline_example_read_file_stream_line_by_line 
                await once(rl, 'close');
                console.log('Index files processed.');

            } catch (error) { console.error('Index file processing error ', error); }
        }
        // Returning populated array out of the function to be used in edgarCrawler.js
        return edgarIndexData;

    } catch (error) { throw error }
}

module.exports = getEdgarIndexSources;