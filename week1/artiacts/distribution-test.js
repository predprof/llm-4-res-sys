const fs = require("fs");
const path = require("path");
const vm = require("vm");

const numberOfClicks = Number.parseInt(process.argv[2] || "1000", 10);
const counts = new Map();
let clickHandler;
let recordSelections = false;

if (!Number.isInteger(numberOfClicks) || numberOfClicks <= 0) {
    throw new Error("The number of clicks must be a positive integer.");
}

const button = {
    addEventListener(eventName, handler) {
        if (eventName === "click") {
            clickHandler = handler;
        }
    },
    click() {
        if (typeof clickHandler === "function") {
            clickHandler();
        }
    },
};

const foodIcon = { innerHTML: "" };
const lunchDisplay = {
    classList: {
        add() {},
        remove() {},
    },
};
const foodName = {
    _textContent: "",
    get textContent() {
        return this._textContent;
    },
    set textContent(value) {
        this._textContent = value;
        if (recordSelections && value !== "Thinking...") {
            counts.set(value, (counts.get(value) || 0) + 1);
        }
    },
};

const document = {
    getElementById(id) {
        return id === "generateBtn" ? button : null;
    },
    querySelector(selector) {
        const elements = {
            ".food-icon": foodIcon,
            ".food-name": foodName,
            ".lunch-display": lunchDisplay,
        };
        return elements[selector] || null;
    },
};

const context = {
    document,
    Math,
    window: {
        setTimeout(callback) {
            callback();
        },
    },
};

const applicationCode = fs.readFileSync(path.join(__dirname, "script.js"), "utf8");
vm.runInNewContext(applicationCode, context, { filename: "script.js" });

if (typeof clickHandler !== "function") {
    throw new Error("The generator did not register its click handler.");
}

recordSelections = true;
for (let click = 0; click < numberOfClicks; click += 1) {
    button.click();
}

const distribution = [...counts.entries()]
    .map(([name, count]) => ({
        name,
        count,
        percentage: (count / numberOfClicks) * 100,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
const observedTotal = distribution.reduce((total, item) => total + item.count, 0);

if (observedTotal !== numberOfClicks) {
    throw new Error(`Expected ${numberOfClicks} selections, observed ${observedTotal}.`);
}

console.log(JSON.stringify({ numberOfClicks, distribution }, null, 2));
