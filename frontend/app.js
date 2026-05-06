import { createBallpit } from './Ballpit.js';
import { initClickSpark } from './ClickSpark.js';
import React from 'react';
import CircularText from './CircularText';

// ── BALLPIT HERO BACKGROUND ──
const ballpitCanvas = document.getElementById('ballpit-canvas');
if (ballpitCanvas) {
  createBallpit(ballpitCanvas, {
    count: 150,
    gravity: 0.4,
    friction: 0.9975,
    wallBounce: 0.95,
    followCursor: true,
    colors: [0x14b8a6, 0x8b5cf6, 0x3b82f6, 0x06b6d4],
    ambientColor: 0xffffff,
    ambientIntensity: 0.6,
    lightIntensity: 180,
    minSize: 0.4,
    maxSize: 0.9,
    maxVelocity: 0.12,
    maxX: 5,
    maxY: 5,
    maxZ: 2,
  });
}

// ── CLICK SPARKS (global, every click) ──
initClickSpark({
  sparkColor:  '#14b8a6',
  sparkSize:   14,
  sparkRadius: 26,
  sparkCount:  8,
  duration:    440,
  easing:      'ease-out',
  extraScale:  1.1,
});

// ── NAV SCROLL ──
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ── IMAGE UPLOAD ──
const uploadZone = document.getElementById('uploadZone');
const fileInput  = document.getElementById('fileInput');
const preview    = document.getElementById('uploadPreview');
const previewImg = document.getElementById('previewImg');
const removeImg  = document.getElementById('removeImg');

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  previewImg.src = url;
  preview.style.display = 'block';
});

removeImg.addEventListener('click', e => {
  e.stopPropagation();
  previewImg.src = '';
  preview.style.display = 'none';
  fileInput.value = '';
});

uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.style.borderColor = 'var(--teal)';
});
uploadZone.addEventListener('dragleave', () => {
  uploadZone.style.borderColor = '';
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    previewImg.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
});

// ── MOCK TRIAGE RESULTS ──
const conditions = [
  {
    name: 'Atopic Dermatitis (Eczema)',
    urgency: 'medium',
    urgencyLabel: '🟡 Moderate Priority',
    confidence: 87,
    condition: 'Atopic Dermatitis — a chronic inflammatory skin condition causing dry, itchy patches.',
    action: 'Schedule a dermatologist visit within 2 weeks. Avoid known triggers; use fragrance-free moisturizer.',
  },
  {
    name: 'Contact Dermatitis',
    urgency: 'low',
    urgencyLabel: '🟢 Low Priority',
    confidence: 91,
    condition: 'Contact Dermatitis — likely allergic reaction to a substance touching the skin.',
    action: 'Identify and avoid the trigger. Over-the-counter hydrocortisone cream may help. See a doctor if symptoms persist beyond 1 week.',
  },
  {
    name: 'Possible Melanoma Risk',
    urgency: 'high',
    urgencyLabel: '🔴 High Priority',
    confidence: 78,
    condition: 'Suspicious pigmented lesion with asymmetry and irregular border. Melanoma cannot be ruled out.',
    action: 'See a dermatologist within 48–72 hours for a dermoscopic evaluation and possible biopsy.',
  },
  {
    name: 'Psoriasis Plaque',
    urgency: 'medium',
    urgencyLabel: '🟡 Moderate Priority',
    confidence: 93,
    condition: 'Plaque Psoriasis — thick, scaly, well-defined patches, typically on elbows, knees, or scalp.',
    action: 'A dermatologist can recommend topical treatments, phototherapy, or systemic therapy. Book within 2 weeks.',
  },
  {
    name: 'Tinea Corporis (Ringworm)',
    urgency: 'low',
    urgencyLabel: '🟢 Low Priority',
    confidence: 96,
    condition: 'Tinea Corporis — a fungal infection causing a ring-shaped, scaly rash on the skin.',
    action: 'Topical antifungal cream (clotrimazole or terbinafine) applied for 2–4 weeks is typically effective.',
  },
];

const analyzeBtn     = document.getElementById('analyzeNow');
const analyzeText    = document.getElementById('analyzeText');
const analyzeSpinner = document.getElementById('analyzeSpinner');
const placeholder    = document.getElementById('resultsPlaceholder');
const resultsContent = document.getElementById('resultsContent');

analyzeBtn.addEventListener('click', () => {
  // Show spinner
  analyzeText.style.display = 'none';
  analyzeSpinner.style.display = 'inline-block';
  analyzeBtn.disabled = true;

  setTimeout(() => {
    analyzeText.style.display = 'inline';
    analyzeSpinner.style.display = 'none';
    analyzeBtn.disabled = false;

    const result = conditions[Math.floor(Math.random() * conditions.length)];
    showResults(result);
  }, 2200);
});

function showResults(r) {
  placeholder.style.display = 'none';
  resultsContent.style.display = 'flex';

  const badge = document.getElementById('urgencyBadge');
  badge.textContent = r.urgencyLabel;
  badge.className = 'result-badge ' + r.urgency;

  document.getElementById('conditionName').textContent = r.name;
  document.getElementById('detailCondition').textContent = r.condition;
  document.getElementById('detailUrgency').textContent = r.urgencyLabel;
  document.getElementById('detailAction').textContent = r.action;

  const fill = document.getElementById('confidenceFill');
  const num  = document.getElementById('confidenceNum');
  fill.style.width = '0%';
  num.textContent = r.confidence + '%';

  // Animate bar
  setTimeout(() => { fill.style.width = r.confidence + '%'; }, 50);

  // Scroll into view
  resultsContent.closest('.triage-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Book button
document.getElementById('bookBtn').addEventListener('click', () => {
  alert('🏥 Booking flow coming soon!\n\nIn the full app, this would connect you to a verified dermatologist in your area with your AI report pre-loaded.');
});

// Hero CTA scroll
document.getElementById('analyzeBtn').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('triage').scrollIntoView({ behavior: 'smooth' });
});

// ── INTERSECTION OBSERVER ANIMATIONS ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.step-card, .feature-card, .testimonial-card, .condition-chip').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

function App() {
  return (
    <div>
      <h1>Welcome to the App</h1>
      <CircularText
        text="REACT*BITS*COMPONENTS*"
        onHover="speedUp"
        spinDuration={20}
        className="custom-class"
      />
    </div>
  );
}

export default App;
