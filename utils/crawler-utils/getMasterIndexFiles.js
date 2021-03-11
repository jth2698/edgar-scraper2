const path = require('path');
const fs = require('fs');
const request = require('request');
const unzipper = require('unzipper');

const quarters = ['QTR1', 'QTR2', 'QTR3', 'QTR4'];

const dataDir = path.resolve('./data');

const makeDirectories = (year) => {

    fs.mkdirSync(`${dataDir}/${year}`, error => {
        if (error && error.code !== 'EEXIST') {
            console.log("year mkdir error: ", error)
        }
    })
}

const getMasterIndexFiles = async (year) => {

    makeDirectories(year);

    const sourceURLs = [];
    const href = 'https://www.sec.gov/Archives/edgar/full-index/';

    quarters.forEach(quarter => {
        sourceURLs.push({
            year: year,
            quarter: quarter,
            url: `${href}/${year}/${quarter}/master.zip`
        })
    })

    console.log(sourceURLs);

    // Due to local extraction issues, we are using unzipper's `Open.url` method to extract the file directly from the sec's website. See https://www.npmjs.com/package/unzipper under "Open.url."
    try {
        for (const sourceURL of sourceURLs) {
            const directory = await unzipper.Open.url(request, sourceURL.url);
            const file = directory.files.find(d => d.path === 'master.idx');
            const content = await file.buffer();
            fs.writeFile(`${dataDir}/${sourceURL.year}/${sourceURL.quarter}-master.idx`, content, error => {
                if (error && error !== null) {
                    console.log('extraction error: ', error);
                }
            })
        }
        return sourceURLs;
    }
    catch (error) { throw error }
}

module.exports = getMasterIndexFiles;