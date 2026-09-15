# Random Lunch Menu Generator

Tired of deciding what to eat for lunch? This web app eliminates the daily dilemma by randomly generating a lunch idea for you! Say goodbye to endless scrolling and "I don't know, what do you want?" conversations.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white)

**Repository:** [predprof/llm-4-res-sys](https://github.com/predprof/llm-4-res-sys/tree/main)

## ✨ Features

*   **Randomized Selection:** Get a completely random lunch suggestion with a single click.
*   **Visual Appeal:** Each suggestion is paired with a relevant icon or image for a better experience.
*   **Simple & Fast:** Lightweight and loads instantly. No ads, no sign-ups.
*   **Mobile-Friendly:** Responsive design that works perfectly on your desktop, tablet, or phone.

## 🚀 Live Demo

Check out the live application hosted on GitHub Pages: https://github.com/predprof/random-lunch-generator

## 🛠️ How It Works

The core logic is simple:
1.  The app contains a predefined list of lunch menu items (e.g., `["Pizza", "Sushi", "Burger", "Salad", "Tacos"]`).
2.  When the user clicks the "Generate" button, a JavaScript function is triggered.
3.  This function randomly selects an item from the list.
4.  The selected item is then dynamically displayed on the webpage, often with a fun animation.

## Fixed problem

The original page sometimes displayed a lunch name without an icon. The selection logic was working, but three icon classes were unavailable in the loaded Font Awesome Free stylesheet:

| Menu item | Original class | Replacement |
|---|---|---|
| Ramen | `fa-bowl-hot` | `fa-bowl-food` |
| Pasta | `fa-pasta` | `fa-plate-wheat` |
| Soup | `fa-bowl` | `fa-mug-hot` |

The replacements are present in Font Awesome Free 6.4.0 and are defined in `script.js`.

## Project structure

```text
week1/
├── index.html                         # Page structure
├── style.css                          # Layout, colors, responsiveness, and animation
├── script.js                          # Lunch menu and random-selection logic
├── README.md                          # Project documentation
├── artiacts/                          # Experiment code, saved results, and validation notes
└── report/
    ├── raimova_alina_a01_report.md    # Reviewable report source
    ├── raimova_alina_a01_report.pdf   # Rendered homework report
    └── raimova_alina_a01_session.json # Tool-native AI session snapshot
```

## 🧩 Installation & Local Development

Want to run this locally or contribute? Follow these steps:

1.  **Clone the repository**
    ```bash
    git clone https://github.com/predprof/llm-4-res-sys.git
    ```
2.  **Navigate to the project directory**
    ```bash
    cd llm-4-res-sys
    ```
3.  **Open it!**  
    Simply open the `index.html` file in your web browser. No complex build processes required!

## 🎯 How to Use

1.  Go to the live demo page or open `index.html` locally.
2.  Click the **"Generate Lunch!"** button.
3.  Watch as a random lunch idea appears on the screen.
4.  Can't decide? Just click the button again!

## 🤝 Contributing

Found a bug or have a great idea for a new feature? Contributions are welcome!
1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

Please feel free to add more menu items to the list in `script.js`!

## 📝 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Author

Raimova Alina — individual assignment.
