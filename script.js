// slider loader play
const sliders = document.querySelectorAll('.main-slider');

sliders.forEach((sliderEl, i) => {
	const parent = sliderEl.closest('.wrapper-slider');
	const paginationEl = parent.querySelector('.swiper-pagination');

	let progress = 0;
	let duration = 6000;
	let isPlaying = true;
	let startTime;
	let rafId;
	let swiper;

	const playSVG = `<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon" viewBox="0 0 24 24">
						<path d="M8 5v14l11-7z"/>
					</svg>`;

	const pauseSVG = `<svg xmlns="http://www.w3.org/2000/svg" class="svg-icon" viewBox="0 0 24 24">
						<path d="M6 19h4V5H6zm8-14v14h4V5h-4z"/>
					  </svg>`;

	swiper = new Swiper(sliderEl, {
		effect: 'fade',
		speed: 1000,
		fadeEffect: {
			crossFade: true,
		},
		loop: true,
		pagination: {
			el: paginationEl,
			clickable: true,
			renderBullet: function (index, className) {
				return `<span class="${className}" data-index="${index}">
							<span class="number">${index + 1}</span>
						</span>`;
			}
		},
		on: {
			init(swiperInstance) {
				swiper = swiperInstance; // asignamos el swiper real
				startCustomAutoplay();
				resetLoaders();
			},
			slideChangeTransitionStart() {
				progress = 0;
				startTime = performance.now();
				resetLoaders();
			}
		}
	});

	function startCustomAutoplay() {
		startTime = performance.now();
		loop();
	}

	function loop(now) {
		if (!isPlaying) return;
		if (!startTime) startTime = now;
		const elapsed = now - startTime;
		progress = Math.min((elapsed / duration) * 100, 100);
		if (swiper) updateLoader(swiper.realIndex, Math.round(progress));
		if (progress >= 100) {
			swiper.slideNext();
			progress = 0;
			startTime = performance.now();
		}
		rafId = requestAnimationFrame(loop);
	}

	function pauseAutoplay() {
		isPlaying = false;
		cancelAnimationFrame(rafId);
	}

	function resumeAutoplay() {
		isPlaying = true;
		startTime = performance.now() - (progress / 100) * duration;
		loop();
	}

	function resetLoaders() {
		paginationEl.querySelectorAll('.swiper-pagination-bullet').forEach((bullet, i) => {
			const isActive = bullet.classList.contains('swiper-pagination-bullet-active');
			if (isActive) {
				bullet.innerHTML = `
                        <div class="bullet-content flex justify-center items-center">
                            <button class="icon playpause-btn absolute z-[1]">
                                ${isPlaying ? pauseSVG : playSVG}
                            </button>    
                            <div class="percentage" style="--p: ${progress}%"></div>
                        </div>
                    `;

				setTimeout(() => {
					const percentage = bullet.querySelector('.percentage');
					if (percentage) {
						percentage.classList.add('show');
					}
				}, 100);

				const btn = bullet.querySelector('.playpause-btn');

				btn.addEventListener('click', () => {
					if (isPlaying) {
						pauseAutoplay();
						btn.innerHTML = playSVG;
					} else {
						resumeAutoplay();
						btn.innerHTML = pauseSVG;
					}
				});
			} else {
				const index = bullet.dataset.index;
				bullet.innerHTML = `<span class="number">${parseInt(index) + 1}</span>`;
			}
		});
	}

	function updateLoader(index, percent) {
		const bullet = paginationEl.querySelectorAll('.swiper-pagination-bullet')[index];
		if (bullet) {
			const percentage = bullet.querySelector('.percentage');
			if (percentage) {
				percentage.style.setProperty('--p', `${percent}%`);
			}
		}
	}
});
