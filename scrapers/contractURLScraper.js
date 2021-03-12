const cheerio = require('cheerio');
const fs = require('fs');

const getEdgarIndexSources = require('../utils/crawler-utils/getEdgarIndexSources');
const fetchSECPage = require('../utils/fetch-utils/fetchSECPage');
const getURLQueue = require('../utils/fetch-utils/getURLQueue');

let indexData;

const getEdgarIndexURLs = async (year) => {

    try {
        console.log('getEdgarIndexURLs running')
        // getEdgarDataSources will return objects containing the index urls for each filing
        indexData = await getEdgarIndexSources(year);
        // Because the urls are within an object, we map the urls out to a new array and return
        const indexURLs = indexData.map(indexEntry => indexEntry.indexURL);
        console.log('getEdgarIndexURLs finished');
        return indexURLs;

    } catch (error) { throw error }

}

const indexScraper = async (url, requests) => {

    contractIndexData = [];

    try {

        console.log(`sent ${requests} request(s) through contractURLScraper`)

        let indexDataIndex;
        const html = await fetchSECPage(url);
        const $ = cheerio.load(html);

        // For the index pages, each row contains td cells. Use Cheerio to loop over each td until it finds one that contains the word 'AGREEMENT' or 'CONTRACT' in either upper or lower case 
        $('td').each((index, element) => {
            if (
                (
                    $(element).text().indexOf('AGREEMENT') > -1
                    || $(element).text().indexOf('Agreement') > -1
                    || $(element).text().indexOf('CONTRACT') > -1
                    || $(element).text().indexOf('Contract') > -1
                ) && (
                    $(element).text().indexOf('AMENDMENT') === -1
                    && $(element).text().indexOf('MODIFICATION') === -1
                )
            ) {
                indexDataIndex = indexData.findIndex(indexObj => indexObj.indexURL === url);
                contractIndexData.push({
                    cik: indexData[indexDataIndex].cik,
                    companyName: indexData[indexDataIndex].companyName,
                    formType: indexData[indexDataIndex].formType,
                    dateFiled: indexData[indexDataIndex].dateFiled,
                    indexURL: indexData[indexDataIndex].indexURL,
                    contractName: $(element).text(),
                    contractURL: `https://sec.gov${$(element).next().find('a').attr('href')}`,
                })
            }
        })

        return contractIndexData;

    } catch (error) { throw error }
}

const scrapeContractURLData = async (year) => {

    try {

        // First generate the array of urls to pass to getURLQueue function 
        const urls = await getEdgarIndexURLs(year);
        // Await the array of promises to be generated from the getURLQueue function
        let queue = await getURLQueue(urls, indexScraper, 110, 0);
        // Then, pass the array to Promise.all and store in a variable to process and read after await
        let contractData = await Promise.all(queue);
        // The filter function is needed to eliminate the empty arrays (where there are no matching tds). This returns an array of arrays (for every url), and each subarray contains one or more objects with the contract name and contract url as key / value pairs
        contractData = contractData.filter(result => result !== undefined && result.length >= 1);
        // .flat() (or [].concat(...data)) removes nested array so all data is returned in one array
        contractData = [].concat(...contractData);

        // Write the conractData to a local JSON file so that we don't have to scrape EDGAR for every run
        await fs.writeFileSync(`./data/${year}/${year}_Master.json`, JSON.stringify(contractData), 'utf8', error => {
            if (error) { console.log(error) }
            else { 'contractData saved ' }
        })

    } catch (error) { throw error };
}

module.exports = scrapeContractURLData;