/* =============================================
   MYTURFY — content-pages.js
   Dynamic interactions for Blog (modal articles reader)
   and Support (smooth, responsive height accordions & tabs)
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ══════════════════════════════════════
     BLOG ARTICLES REPOSITORY
     ══════════════════════════════════════ */
  const ARTICLES = {
    '5 Things to Check Before Booking Any Turf': {
      title: '5 Things to Check Before Booking Any Turf',
      category: 'Booking Tips',
      date: 'Jun 12, 2026',
      author: 'Kabir Dev (MyTurfy Team)',
      image: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=1000&q=80',
      html: `
        <p>There's nothing quite like the excitement of gathering your squad for a weekly match. The energy, the competitive spirit, the thrill of scoring a brilliant goal. However, all that excitement can quickly turn into frustration if the venue doesn't live up to expectations.</p>
        <p>Before you lock in your next turf booking and transfer your hard-earned money, here are the five essential factors you should check to guarantee a premium play experience.</p>
        
        <h2>1. The Pitch Surface Condition</h2>
        <p>Not all synthetic grass is created equal. Check the court details for the type of turf used. A high-quality turf uses a "3G" or "4G" synthetic grass specification, meaning it has upright blades infilled with sand and rubber granules to mimic real grass. Older turfs might have matted blades or a hard surface, which puts extra stress on your knees and ankles, leading to joint pain or carpet burns.</p>

        <h2>2. LED Stadium Floodlights</h2>
        <p>If you're booking an evening or night slot, lighting is everything. Look for venues highlighting uniform LED floodlights. Poor lighting creates dark zones and long shadows on the field, which makes tracking the ball difficult and increases the risk of collisions and injuries. Premium venues ensure floodlights are angled correctly to eliminate glare.</p>

        <blockquote>
          "A great game of football requires perfect visibility. Proper stadium lighting keeps players safe and matches high-tempo."
        </blockquote>

        <h2>3. Changing Rooms, Showers & Amenities</h2>
        <p>Playing sports is sweaty business. Check if the venue offers clean changing rooms, locker storage, and functioning showers. Having a safe place to store bags and wash up before heading back home or to a restaurant is a huge quality-of-life feature that separates basic fields from premium facilities.</p>

        <h2>4. Equipment Provided</h2>
        <p>Do you need to bring your own match bibs and a size-5 ball? Many premium venues list the tools they provide (e.g. training cones, bibs, pumps, quality match balls). Finding a turf that supplies these for free saves your group money and means you don't have to carry deflated balls around.</p>

        <h2>5. The Cancellation & Rescheduling Window</h2>
        <p>Plans change. A player drops out, rain pours, or work keeps you late. Always check the refund policy. With MyTurfy, many venues support free cancellations up to 2 or 12 hours before your game. Knowing the exact cutoff time ensures you don't lose your booking payment if your team has a scheduling emergency.</p>
      `
    },
    'How to Organize a Weekend 7-a-Side Match': {
      title: 'How to Organize a Weekend 7-a-Side Match',
      category: 'Game Guides',
      date: 'Jun 5, 2026',
      author: 'Rohit Sharma (Sports Coordinator)',
      image: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1000&q=80',
      html: `
        <p>Getting 14 people to show up at the exact same location, at the exact same time, with matching footwear and a positive attitude is harder than running a project at work. If you're the designated "organizer" for your friend group, you know the struggle is real.</p>
        <p>Here is a step-by-step game plan to minimize group-chat drama and make organizing your weekend 7v7 matches a breeze.</p>

        <h2>Step 1: Start the RSVP Poll Early</h2>
        <p>Do not wait until Friday afternoon to ask who's playing. Send out your availability poll on Tuesday morning. Set a strict deadline for Wednesday evening. This gives you plenty of time to find backup players if you fall short of the required 14 names.</p>

        <h2>Step 2: Collect the Money Upfront</h2>
        <p>The number one reason players flake last-minute is because they haven't paid yet. It's easy to stay in bed on a rainy Sunday morning when there's no financial loss. Collect the booking fee share from everyone via UPI before you confirm the turf. "Pay to play" is the golden rule of sports organization.</p>

        <blockquote>
          "Upfront payment builds commitment. When a player has paid their share, their attendance rate rises to nearly 99%."
        </blockquote>

        <h2>Step 3: Keep Two Standby Players</h2>
        <p>In a 14-person match, expect at least one or two last-minute cancellations due to traffic, muscle pulls, or emergencies. Always have a couple of friends on speed-dial who are willing to play on short notice, or maintain a "standby list" in your poll.</p>

        <h2>Step 4: Balance the Teams in Advance</h2>
        <p>Don't waste 15 minutes of your precious 1-hour turf rental arguing about teams. Draft the teams (Team A vs Team B) on Friday night. Share the rosters in the group chat. This builds friendly banter beforehand and means you start kickoff the second your slot begins.</p>
      `
    },
    '3 Ways to Fill Your Empty Weekday Slots': {
      title: '3 Ways to Fill Your Empty Weekday Slots',
      category: 'For Owners',
      date: 'May 28, 2026',
      author: 'Ananya Patel (Partner Success)',
      image: 'https://images.unsplash.com/photo-1556056504-5c7696c4c28d?w=1000&q=80',
      html: `
        <p>For sports venue owners, empty courts represent lost potential. While weekend slots and weekday evening slots (6 PM to 10 PM) sell out instantly, corporate hours (9 AM to 4 PM) often sit completely quiet. Leaving these slots unbooked directly affects your bottom line.</p>
        <p>Here are three proven strategies top-performing MyTurfy partners use to maximize occupancy during off-peak hours.</p>

        <h2>1. Corporate Memberships & Lunch Leagues</h2>
        <p>Reach out to local corporate offices and IT parks near your venue. Many HR departments are actively looking for wellness programs and team-building activities. Offer special "Corporate Subscriptions" for weekday afternoon slots. Running a short lunch-hour box-cricket league is a great hook to capture corporate interest.</p>

        <h2>2. Subsidize Youth Academies & Coaching</h2>
        <p>Partner with local coaching academies, schools, and professional trainers. Youth training sessions typically take place during the afternoon (3 PM to 5 PM) when kids finish school. By offering these academies block discounts, you secure a steady stream of recurring monthly revenue for hours that would otherwise remain empty.</p>

        <blockquote>
          "Securing recurring academy bookings creates a reliable baseline of weekday revenue, protecting you from seasonal dips."
        </blockquote>

        <h2>3. Implement Flash Sales & Dynamic Pricing</h2>
        <p>Using your MyTurfy dashboard, you can dynamically adjust pricing for your off-peak slots. Dropping your hourly rate by 30% to 40% for the 10 AM to 3 PM window attracts freelancers, college students, and shift workers who are looking for a deal. A cheaper slot is always better than an empty slot.</p>
      `
    },
    'Morning vs Evening Slots: Which Is Actually Cheaper?': {
      title: 'Morning vs Evening Slots: Which Is Actually Cheaper?',
      category: 'Booking Tips',
      date: 'May 20, 2026',
      author: 'Devendra Gowda (Data Analyst)',
      image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=1000&q=80',
      html: `
        <p>We analyzed over 25,000 bookings across major sports complexes to answer the age-old question: does the time of day you play impact how much you pay? The short answer is yes — and the difference can be significant.</p>
        <p>Here's a breakdown of peak pricing trends and how you can save cash on your next sports session.</p>

        <h2>The Premium Peak: 6 PM to 10 PM</h2>
        <p>Unsurprisingly, weekday evenings are the golden hours for turf bookings. Because most people work 9-to-5 schedules, everybody wants to play after office hours. As a result, venue owners charge peak premium pricing during this window. In high-demand cities, a slot at 8 PM can cost up to 50% more than a slot at 8 AM.</p>

        <h2>The Morning Discount: 6 AM to 9 AM</h2>
        <p>If you're willing to wake up early, morning slots are a goldmine. Not only is the air fresher and the temperature cooler, but morning slots are heavily discounted. Our data shows morning bookings are on average 35% cheaper than evening slots. Plus, starting your day with a high-intensity football or badminton match sets a great tone for the rest of your day.</p>

        <blockquote>
          "Early birds save big. Playing in the morning gives you the exact same pitch quality at a fraction of the cost."
        </blockquote>

        <h2>The Indoor Afternoon Strategy</h2>
        <p>Outdoor pitches can get extremely hot during the afternoon (12 PM to 4 PM). However, this is the perfect time to book indoor air-conditioned facilities, bowling alleys, or pool tables. Owners offer steep off-peak discounts during these hours, making it highly affordable for college groups and friends on break.</p>
      `
    },
    'Basketball Court Etiquette 101': {
      title: 'Basketball Court Etiquette 101',
      category: 'Game Guides',
      date: 'May 14, 2026',
      author: 'Marcus Dias (Basketball Coach)',
      image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1000&q=80',
      html: `
        <p>Basketball is a fast-paced game of passion, skill, and physical contact. Whether you are booking a half-court for a quick 3-on-3 or a full hardwood court for a league match, keeping the environment friendly and respectful ensures everyone enjoys the session.</p>
        <p>Here are the key unwritten rules of court etiquette every player should follow.</p>

        <h2>1. Respect the Booking Schedule</h2>
        <p>If your slot is from 7 PM to 8 PM, do not run onto the court at 6:55 PM while the previous group is playing their final points. Similarly, wrap up your game, collect your gear, and step off the court by 7:59 PM. Respect the next group's time just as you expect yours to be respected.</p>

        <h2>2. Wear Non-Marking Court Shoes</h2>
        <p>Never wear outdoor running shoes, boots, or slippers on a indoor polished basketball court. Outdoor shoes bring in dirt, pebbles, and moisture, which damage the wooden floor and make it slippery and dangerous. Always change into non-marking basketball shoes when stepping onto the court.</p>

        <blockquote>
          "Proper footwear is a safety requirement, not a fashion choice. Non-marking shoes preserve the grip of the court floor for everyone."
        </blockquote>

        <h2>3. Call Your Own Fouls fairly</h2>
        <p>Pickup basketball is self-refereed. The general rule is simple: the offensive player calls the foul, and call it only if it genuinely affects your shot or drive. Avoid arguing about calls. If there's a dispute, shoot a three-pointer to resolve it. Keep the game moving.</p>

        <h2>4. Clean Up Your Bench Area</h2>
        <p>Do not leave empty plastic bottles, tape wrappers, or sweat towels on the player bench. Take a minute to throw your garbage in the bin before you leave. Keeping the court clean is a sign of respect for the game and the players coming after you.</p>
      `
    },
    'Photos That Actually Get You Booked': {
      title: 'Photos That Actually Get You Booked',
      category: 'For Owners',
      date: 'May 6, 2026',
      author: 'Vikram Sen (Professional Photographer)',
      image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1000&q=80',
      html: `
        <p>When players browse MyTurfy for a sports spot, they make their decision in milliseconds. While price and location are important, the visual appeal of your pitch is the ultimate deciding factor. Venues with bright, high-resolution photos get up to 3 times more bookings than those with low-quality or placeholder images.</p>
        <p>Here are a few quick photography tips you can execute using your smartphone to instantly make your listing stand out.</p>

        <h2>1. Shoot During the Golden Hour or Night</h2>
        <p>Natural daylight just before sunset (the Golden Hour) makes synthetic grass look vibrant and inviting. Alternatively, turn on your floodlights at night and take a photo from the center of the pitch. Night shots with bright lights highlight the "stadium feel" that players love.</p>

        <h2>2. Capture the Surface Quality Up Close</h2>
        <p>Players care deeply about the turf blades. Crouching down and taking a photo at grass level shows off the thickness and condition of your pitch. If your turf has recently been refurbished, highlight this in your photos — it's a huge selling point!</p>

        <blockquote>
          "Close-up grass photos build trust. Players want to know they are playing on a soft, safe, premium grass surface."
        </blockquote>

        <h2>3. Include Amenities & Facilities</h2>
        <p>Don't just photograph the field. Take photos of your entrance, spectator seating, parking lot, and changing rooms. Showing players that you have clean, secure, and comfortable facilities gives them the confidence to choose your venue over competitors.</p>
      `
    }
  };

  /* ══════════════════════════════════════
     BLOG CARD OVERLAY INJECTOR & MANAGER
     ══════════════════════════════════════ */
  const blogGrid = $('#blogGrid');
  if (blogGrid) {
    // Create and append the Modal Reader markup dynamically if not in HTML
    if (!$('.article-modal-overlay')) {
      const modalHtml = `
        <div class="article-modal-overlay" id="articleModal">
          <div class="article-modal-container">
            <button class="article-modal-close" id="articleCloseBtn" aria-label="Close article"><i class="fas fa-times"></i></button>
            <div class="article-progress-bar" id="articleProgress"></div>
            <div class="article-modal-body" id="articleBody"></div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    const modal = $('#articleModal');
    const articleBody = $('#articleBody');
    const closeBtn = $('#articleCloseBtn');
    const progressBar = $('#articleProgress');

    function openArticle(articleTitle) {
      const art = ARTICLES[articleTitle];
      if (!art) return;

      articleBody.innerHTML = `
        <div class="article-hero-banner" style="background-image: url('${art.image}')">
          <div class="article-hero-content">
            <span class="article-title-tag">${art.category}</span>
            <h1 class="article-main-title">${art.title}</h1>
          </div>
        </div>
        <div class="article-meta-row">
          <div class="article-meta-item"><i class="fas fa-calendar"></i> ${art.date}</div>
          <div class="article-meta-item"><i class="fas fa-user-edit"></i> By ${art.author}</div>
          <div class="article-meta-item"><i class="fas fa-clock"></i> 3 Min Read</div>
        </div>
        <div class="article-rich-text">
          ${art.html}
        </div>
      `;

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
      progressBar.style.width = '0%';
      articleBody.scrollTop = 0;
    }

    function closeArticle() {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Intercept clicks on blog cards
    $$('.blog-card').forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const title = card.querySelector('h3')?.textContent?.trim();
        if (title) openArticle(title);
      });
    });

    closeBtn?.addEventListener('click', closeArticle);
    modal?.addEventListener('click', e => { if (e.target === modal) closeArticle(); });

    // Update reading progress bar based on body scroll
    articleBody?.addEventListener('scroll', () => {
      const scrollHeight = articleBody.scrollHeight - articleBody.clientHeight;
      if (scrollHeight > 0) {
        const pct = (articleBody.scrollTop / scrollHeight) * 100;
        progressBar.style.width = `${pct}%`;
      }
    });
  }


  /* ══════════════════════════════════════
     SUPPORT ACCORDION & TABS MANAGER
     ══════════════════════════════════════ */
  const faqList = $('#faqList');
  if (faqList) {
    // 1. Better smooth accordion with dynamic height calculation
    $$('.faq-item').forEach(item => {
      const btn = item.querySelector('.faq-q');
      const answer = item.querySelector('.faq-a');
      
      btn?.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        
        // Close all other FAQ items smoothly
        $$('.faq-item.open').forEach(i => {
          i.classList.remove('open');
          i.querySelector('.faq-a').style.maxHeight = '0px';
        });

        if (!isOpen) {
          item.classList.add('open');
          // Set dynamic maxHeight based on the scrollHeight
          if (answer) {
            answer.style.maxHeight = answer.scrollHeight + 'px';
          }
        } else {
          item.classList.remove('open');
          if (answer) {
            answer.style.maxHeight = '0px';
          }
        }
      });
    });

    // 2. Interactive quick link tabs (Filters FAQs by category)
    $$('.support-quick-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        const category = card.querySelector('h3')?.textContent?.toLowerCase()?.trim() || '';
        
        // Highlight active quick card
        $$('.support-quick-card').forEach(c => c.style.borderColor = 'var(--border)');
        card.style.borderColor = 'var(--green)';

        // Map categories to keywords
        let keyword = '';
        if (category.includes('booking')) keyword = 'booking';
        else if (category.includes('payment') || category.includes('refund')) keyword = 'refund';
        else if (category.includes('owner')) keyword = 'owner';
        else if (category.includes('account') || category.includes('privacy')) keyword = 'account';

        // Filter accordion list
        let visibleCount = 0;
        $$('.faq-item').forEach(item => {
          const keywords = item.dataset.q?.toLowerCase() || '';
          if (keywords.includes(keyword)) {
            item.style.display = 'block';
            visibleCount++;
          } else {
            item.style.display = 'none';
          }
        });

        const emptyMsg = $('#faqEmpty');
        if (emptyMsg) emptyMsg.style.display = visibleCount ? 'none' : 'block';

        // Scroll FAQ list into view
        faqList.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // 3. Add extra text / support guarantees inside the support page to make it premium
    const supportContainer = faqList.parentElement;
    if (supportContainer) {
      const guaranteeHtml = `
        <div class="support-guarantees" style="margin-top: 48px; border-top: 1px solid var(--border); padding-top: 40px;">
          <h3 style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--text);text-align:center;margin-bottom:24px;letter-spacing:1px">
            <i class="fas fa-shield-halved" style="color:var(--green)"></i> The MyTurfy Support Guarantee
          </h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(250px, 1fr));gap:20px;">
            <div style="background:var(--dark3);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;">
              <div style="font-size:22px;color:var(--green);margin-bottom:8px;"><i class="fas fa-lock"></i></div>
              <strong style="color:var(--text);display:block;margin-bottom:6px;font-size:14px">Secure Payout & PNR Check</strong>
              <p style="color:var(--muted);font-size:12px;margin:0;line-height:1.5">All booking values are securely managed. Turf slots are instantly locked to prevent double-bookings.</p>
            </div>
            <div style="background:var(--dark3);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;">
              <div style="font-size:22px;color:var(--green);margin-bottom:8px;"><i class="fas fa-comments-dollar"></i></div>
              <strong style="color:var(--text);display:block;margin-bottom:6px;font-size:14px">Fair Refund Policy</strong>
              <p style="color:var(--muted);font-size:12px;margin:0;line-height:1.5">Cancellations made outside of 24h of the slot start are fully automated. Money goes straight to bank or UPI.</p>
            </div>
            <div style="background:var(--dark3);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;">
              <div style="font-size:22px;color:var(--green);margin-bottom:8px;"><i class="fas fa-headset"></i></div>
              <strong style="color:var(--text);display:block;margin-bottom:6px;font-size:14px">Priority Escalation</strong>
              <p style="color:var(--muted);font-size:12px;margin:0;line-height:1.5">Disputes regarding lights, turf conditions, or slot delays are resolved within 24 hours by team coordinators.</p>
            </div>
          </div>
        </div>
      `;
      supportContainer.insertAdjacentHTML('beforeend', guaranteeHtml);
    }
  }

});
