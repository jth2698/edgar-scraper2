const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const contractSchema = new Schema({

    cik: { type: Number },
    companyName: { type: String },
    formType: { type: String },
    dateFiled: { type: Date },
    indexURL: { type: String },
    contractName: { type: String },
    contractURL: { type: String },
    firstPara: { type: String },
    clauses: [
        {
            number: String,
            heading: String,
            clause: String,
            subclauses: [{
                subsection: String,
                heading: String,
                subclause: String,
                subparts: [{
                    subpartref: String,
                    heading: String,
                    subpart: String
                }]
            }]
        }]
});

const Contract = mongoose.model('Contract', contractSchema);
module.exports = Contract;