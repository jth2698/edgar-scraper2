const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const contractMetaSchema = new Schema({

    cik: { type: Number },
    companyName: { type: String },
    formType: { type: String },
    dateFiled: { type: Date },
    indexURL: { type: String },
    contractName: { type: String },
    contractURL: { type: String },
});

const ContractMeta = mongoose.model('ContractMeta', contractMetaSchema);
module.exports = ContractMeta;