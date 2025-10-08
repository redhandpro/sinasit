// Active navigation state management
        const navLinks = document.querySelectorAll('.nav-links a');
        const sections = document.querySelectorAll('.section');

        // Function to update active nav link
        function updateActiveNav() {
            let current = '';
            sections.forEach(section => {
                const sectionTop = section.offsetTop;
                const sectionHeight = section.clientHeight;
                if (window.scrollY >= (sectionTop - 200)) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === `#${current}`) {
                    link.classList.add('active');
                }
            });
        }

        // Listen for scroll events
        window.addEventListener('scroll', updateActiveNav);

        // Mobile menu toggle functionality
        const menuToggle = document.getElementById('menuToggle');
        const navLinksContainer = document.getElementById('navLinks');

        menuToggle.addEventListener('click', () => {
            navLinksContainer.classList.toggle('active');
        });

        // Close mobile menu when clicking on a link
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navLinksContainer.classList.remove('active');
            });
        });

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !navLinksContainer.contains(e.target)) {
                navLinksContainer.classList.remove('active');
            }
        });
