const lunchMenu = [
    { name: "Pizza", icon: "fas fa-pizza-slice" },
    { name: "Sushi", icon: "fas fa-fish" },
    { name: "Burger", icon: "fas fa-hamburger" },
    { name: "Salad", icon: "fas fa-leaf" },
    { name: "Tacos", icon: "fas fa-utensil-spoon" },
    { name: "Ramen", icon: "fas fa-bowl-food" },
    { name: "Sandwich", icon: "fas fa-bread-slice" },
    { name: "Pasta", icon: "fas fa-plate-wheat" },
    { name: "Curry", icon: "fas fa-mortar-pestle" },
    { name: "Steak", icon: "fas fa-drumstick-bite" },
    { name: "Soup", icon: "fas fa-mug-hot" },
    { name: "BBQ", icon: "fas fa-fire" },
];

const generateButton = document.getElementById("generateBtn");
const foodIcon = document.querySelector(".food-icon");
const foodName = document.querySelector(".food-name");
const lunchDisplay = document.querySelector(".lunch-display");

function generateRandomLunch() {
    lunchDisplay.classList.remove("fade-in");

    const randomIndex = Math.floor(Math.random() * lunchMenu.length);
    const selectedLunch = lunchMenu[randomIndex];

    foodIcon.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
    foodName.textContent = "Thinking...";

    window.setTimeout(() => {
        foodIcon.innerHTML = `<i class="${selectedLunch.icon}" aria-hidden="true"></i>`;
        foodName.textContent = selectedLunch.name;
        lunchDisplay.classList.add("fade-in");
    }, 500);
}

generateButton.addEventListener("click", generateRandomLunch);
generateRandomLunch();
