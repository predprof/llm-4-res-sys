const fs = require("fs");
const path = require("path");
const vm = require("vm");


const NUMBER_OF_CLICKS = 100000;
const SEED = 20260914;
const applicationCode = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
const menuNames = [...applicationCode.matchAll(/\{ name: "([^"]+)", icon:/g)]
    .map((match) => match[1]);

function mulberry32(seed) {
    let state = seed;
    return function random() {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function directCounts() {
    const random = mulberry32(SEED);
    const counts = Array(menuNames.length).fill(0);

    random(); // Match the application's automatic selection on page load.
    for (let click = 0; click < NUMBER_OF_CLICKS; click += 1) {
        const index = Math.floor(random() * menuNames.length);
        counts[index] += 1;
    }

    return Object.fromEntries(menuNames.map((name, index) => [name, counts[index]]));
}

function handlerCounts() {
    const counts = new Map();
    const contextMath = Object.create(Math);
    let clickHandler;
    let recordSelections = false;

    contextMath.random = mulberry32(SEED);
    const button = {
        addEventListener(eventName, handler) {
            if (eventName === "click") clickHandler = handler;
        },
        click() {
            clickHandler();
        },
    };
    const foodName = {
        set textContent(value) {
            if (recordSelections && value !== "Thinking...") {
                counts.set(value, (counts.get(value) || 0) + 1);
            }
        },
    };
    const elements = {
        ".food-icon": { innerHTML: "" },
        ".food-name": foodName,
        ".lunch-display": { classList: { add() {}, remove() {} } },
    };
    const context = {
        Math: contextMath,
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
    for (let click = 0; click < NUMBER_OF_CLICKS; click += 1) {
        button.click();
    }

    return Object.fromEntries(menuNames.map((name) => [name, counts.get(name) || 0]));
}

const direct = directCounts();
const throughHandler = handlerCounts();
const matches = JSON.stringify(direct) === JSON.stringify(throughHandler);

if (!matches) {
    throw new Error("The click-handler harness does not match direct index selection.");
}

console.log(JSON.stringify({
    seed: SEED,
    numberOfClicks: NUMBER_OF_CLICKS,
    matches,
    counts: direct,
}, null, 2));
