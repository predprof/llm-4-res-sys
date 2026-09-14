const fs = require("fs");
const path = require("path");
const vm = require("vm");


const numberOfSelections = Number.parseInt(process.argv[2] || "100000", 10);
const outputPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(__dirname, `random-sequence-${numberOfSelections}.json`);

if (!Number.isInteger(numberOfSelections) || numberOfSelections <= 1) {
    throw new Error("The number of selections must be an integer greater than one.");
}

const applicationCode = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
const menuNames = [...applicationCode.matchAll(/\{ name: "([^"]+)", icon:/g)]
    .map((match) => match[1]);
const indexByName = new Map(menuNames.map((name, index) => [name, index]));

if (menuNames.length !== 12) {
    throw new Error(`Expected 12 menu entries, found ${menuNames.length}.`);
}

let clickHandler;
let recordSelections = false;
const sequence = [];

const button = {
    addEventListener(eventName, handler) {
        if (eventName === "click") {
            clickHandler = handler;
        }
    },
    click() {
        if (typeof clickHandler !== "function") {
            throw new Error("The generator did not register its click handler.");
        }
        clickHandler();
    },
};

const foodName = {
    set textContent(value) {
        if (!recordSelections || value === "Thinking...") {
            return;
        }
        const index = indexByName.get(value);
        if (index === undefined) {
            throw new Error(`Unknown menu item emitted by application: ${value}`);
        }
        sequence.push(index);
    },
};

const elements = {
    ".food-icon": { innerHTML: "" },
    ".food-name": foodName,
    ".lunch-display": { classList: { add() {}, remove() {} } },
};

const context = {
    Math,
    document: {
        getElementById(id) {
            return id === "generateBtn" ? button : null;
        },
        querySelector(selector) {
            return elements[selector] || null;
        },
    },
    window: {
        setTimeout(callback) {
            callback();
        },
    },
};

vm.runInNewContext(applicationCode, context, { filename: "script.js" });
recordSelections = true;

for (let selection = 0; selection < numberOfSelections; selection += 1) {
    button.click();
}

if (sequence.length !== numberOfSelections) {
    throw new Error(`Expected ${numberOfSelections} recorded indices, found ${sequence.length}.`);
}

const counts = Array(menuNames.length).fill(0);
for (const index of sequence) {
    counts[index] += 1;
}

const output = {
    protocol: {
        numberOfSelections,
        randomSource: "native Node.js Math.random()",
        selectionRule: "Math.floor(Math.random() * lunchMenu.length)",
        automaticPageLoadSelectionExcluded: true,
        rerunPolicy: "Preserve this first protocol run regardless of its p-values.",
    },
    environment: {
        node: process.version,
    },
    menu: menuNames,
    counts,
    sequence,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
    outputPath,
    numberOfSelections,
    first20Indices: sequence.slice(0, 20),
    counts,
}, null, 2));

