/**
 * Fetches content from Google Sheets or content/site.json and applies it to the page.
 * Configure sheet-config.js with your Google Sheet ID to use Sheets.
 */
(function () {
  function setText(el, text) {
    if (el && text != null) el.textContent = text;
  }

  function setAttr(el, name, value) {
    if (el && value != null) el.setAttribute(name, value);
  }

  function parseCSV(text) {
    var rows = [];
    var inQuotes = false;
    var row = [];
    var cell = '';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes && (c === ',' || c === '\n' || c === '\r')) {
        if (c !== '\r') row.push(cell.trim());
        cell = '';
        if (c === '\n') { rows.push(row); row = []; }
      } else if (c !== '\r') cell += c;
    }
    row.push(cell.trim());
    if (row.length) rows.push(row);
    return rows;
  }

  function fetchUrl(url) {
    var cfg = window.GA_SHEET_CONFIG || {};
    if (cfg.useCorsProxy) {
      url = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    }
    return fetch(url).then(function (r) { return r.ok ? r.text() : null; });
  }

  function loadFromSheet(cfg) {
    var url = cfg.sheetUrl || ('https://docs.google.com/spreadsheets/d/' + cfg.sheetId + '/pub?output=csv&gid=' + (cfg.gid || 0));
    return fetchUrl(url).then(function (text) {
      if (!text) return null;
      var rows = parseCSV(text);
      var data = { hero: {}, about: {}, venue: {}, contacts: {}, social: {}, practical: {}, footer: {}, faq: [], documents: [], sponsors: [] };
      var section = 'config';
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        var a0 = (r[0] || '').trim();
        var a1 = (r[1] || '').trim();
        if (a0 === '[FAQ]') { section = 'faq'; continue; }
        if (a0 === '[DOCUMENTS]') { section = 'documents'; continue; }
        if (a0 === '[SPONSORS]') { section = 'sponsors'; continue; }
        if (section === 'config' && a0 && a0 !== 'key') {
          if (a0 === 'hero.title') data.hero.title = a1;
          else if (a0 === 'hero.subtitle') data.hero.subtitle = a1;
          else if (a0 === 'hero.chips') data.hero.chips = a1 ? a1.split(';').map(function (v) { return { value: v.trim() }; }) : [];
          else if (a0 === 'hero.infoPackUrl') data.hero.infoPackUrl = a1;
          else if (a0 === 'hero.contactUrl') data.hero.contactUrl = a1;
          else if (a0 === 'about.title') data.about.title = a1;
          else if (a0 === 'about.items') data.about.items = a1 ? a1.split(';').map(function (v) { return { value: v.trim() }; }) : [];
          else if (a0 === 'venue.title') data.venue.title = a1;
          else if (a0 === 'venue.venueName') data.venue.venueName = a1;
          else if (a0 === 'venue.addressLine1') data.venue.addressLine1 = a1;
          else if (a0 === 'venue.addressLine2') data.venue.addressLine2 = a1;
          else if (a0 === 'venue.cityPostal') data.venue.cityPostal = a1;
          else if (a0 === 'venue.mapEmbedUrl') data.venue.mapEmbedUrl = a1;
          else if (a0 === 'venue.campusMapImage') data.venue.campusMapImage = a1;
          else if (a0 === 'venue.gettingThere') data.venue.gettingThere = a1;
          else if (a0 === 'contacts.ocEmail') data.contacts.ocEmail = a1;
          else if (a0 === 'contacts.venueContact') data.contacts.venueContact = a1;
          else if (a0 === 'social.instagram') data.social.instagram = a1;
          else if (a0 === 'social.facebook') data.social.facebook = a1;
          else if (a0 === 'social.linkedin') data.social.linkedin = a1;
          else if (a0 === 'practical.accommodation') data.practical.accommodation = a1;
          else if (a0 === 'practical.foodDietary') data.practical.foodDietary = a1;
          else if (a0 === 'practical.accessibility') data.practical.accessibility = a1;
          else if (a0 === 'practical.emergency') data.practical.emergency = a1;
          else if (a0 === 'footer.line1') data.footer.line1 = a1;
          else if (a0 === 'footer.copyright') data.footer.copyright = a1;
          else if (a0 === 'footer.identityNote') data.footer.identityNote = a1;
        } else if (section === 'faq' && a0 !== 'question' && (a0 || a1)) {
          data.faq.push({ question: a0, answer: a1 });
        } else if (section === 'documents' && a0 !== 'title' && a0) {
          data.documents.push({ title: a0, description: a1, url: (r[2] || '#').trim(), linkText: (r[3] || 'Download / View').trim() });
        } else if (section === 'sponsors' && a0 !== 'name' && a0) {
          data.sponsors.push({ name: a0 });
        }
      }
      return data;
    });
  }

  function apply(data) {
    if (!data) return;

    var hero = data.hero;
    if (hero) {
      setText(document.querySelector('[data-content="hero.title"]'), hero.title);
      setText(document.querySelector('[data-content="hero.subtitle"]'), hero.subtitle);
      var chipRow = document.querySelector('[data-content="hero.chips"]');
      if (chipRow) {
        var chips = hero.chips;
        chipRow.innerHTML = (Array.isArray(chips) ? chips : []).map(function (c) {
          var v = c && (c.value != null ? c.value : c);
          return '<span class="chip">' + (v || '').replace(/</g, '&lt;') + '</span>';
        }).join('');
      }
      setAttr(document.querySelector('[data-content-href="hero.infoPackUrl"]'), 'href', hero.infoPackUrl);
      setAttr(document.querySelector('[data-content-href="hero.contactUrl"]'), 'href', hero.contactUrl);
    }

    var about = data.about;
    if (about) {
      setText(document.querySelector('[data-content="about.title"]'), about.title);
      var aboutList = document.querySelector('[data-content="about.items"]');
      if (aboutList) {
        var items = about.items;
        aboutList.innerHTML = (Array.isArray(items) ? items : []).map(function (it) {
          var v = it && (it.value != null ? it.value : it);
          return '<li>' + (v || '').replace(/</g, '&lt;') + '</li>';
        }).join('');
      }
    }

    var venue = data.venue;
    if (venue) {
      setText(document.querySelector('[data-content="venue.title"]'), venue.title);
      setText(document.querySelector('[data-content="venue.venueName"]'), venue.venueName);
      setText(document.querySelector('[data-content="venue.addressLine1"]'), venue.addressLine1);
      setText(document.querySelector('[data-content="venue.addressLine2"]'), venue.addressLine2);
      setText(document.querySelector('[data-content="venue.cityPostal"]'), venue.cityPostal);
      var mapIframe = document.querySelector('[data-content="venue.mapEmbedUrl"]');
      if (mapIframe) mapIframe.setAttribute('src', venue.mapEmbedUrl || '');
      var campusImg = document.querySelector('[data-content="venue.campusMapImage"]');
      if (campusImg) campusImg.setAttribute('src', venue.campusMapImage || '');
      var gettingThere = document.querySelector('[data-content="venue.gettingThere"]');
      if (gettingThere && venue.gettingThere) {
        var ps = venue.gettingThere.split(/\.\s+/).filter(Boolean);
        gettingThere.innerHTML = ps.map(function (p) { return '<p>' + p.replace(/</g, '&lt;') + '</p>'; }).join('');
      }
    }

    var contacts = data.contacts;
    if (contacts) {
      setText(document.querySelector('[data-content="contacts.ocEmail"]'), contacts.ocEmail);
      setText(document.querySelector('[data-content="contacts.venueContact"]'), contacts.venueContact);
    }

    var social = data.social;
    if (social) {
      setText(document.querySelector('[data-content="social.instagram"]'), social.instagram);
      setText(document.querySelector('[data-content="social.facebook"]'), social.facebook);
      setText(document.querySelector('[data-content="social.linkedin"]'), social.linkedin);
    }

    var sponsors = data.sponsors;
    var sponsorGrid = document.querySelector('[data-content="sponsors"]');
    if (sponsorGrid && Array.isArray(sponsors)) {
      sponsorGrid.innerHTML = sponsors.map(function (s) {
        var n = s && (s.name != null ? s.name : s);
        return '<div class="sponsor-logo">' + (n || '').replace(/</g, '&lt;') + '</div>';
      }).join('');
    }

    var faq = data.faq;
    var faqContainer = document.querySelector('[data-content="faq"]');
    if (faqContainer && Array.isArray(faq)) {
      faqContainer.innerHTML = faq.map(function (item) {
        var q = (item.question || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        var a = (item.answer || '').replace(/</g, '&lt;');
        return '<details><summary>' + q + '</summary><div class="accordion-content">' + a + '</div></details>';
      }).join('');
    }

    var documents = data.documents;
    var docContainer = document.querySelector('[data-content="documents"]');
    if (docContainer && Array.isArray(documents)) {
      docContainer.innerHTML = documents.map(function (d) {
        var title = (d.title || '').replace(/</g, '&lt;');
        var desc = (d.description || '').replace(/</g, '&lt;');
        var url = d.url || '#';
        var linkText = (d.linkText || 'Download / View').replace(/</g, '&lt;');
        var disabled = url === '#' ? ' btn-disabled" href="#" aria-disabled="true"' : '" href="' + (url + '').replace(/"/g, '&quot;') + '"';
        return '<div class="card doc-card"><h3>' + title + '</h3><p>' + desc + '</p><a class="btn' + disabled + '>' + linkText + '</a></div>';
      }).join('');
    }

    var practical = data.practical;
    if (practical) {
      function toParagraphs(str) {
        if (!str) return '';
        return str.split(/\.\s+/).filter(Boolean).map(function (p) {
          var t = p.trim().replace(/</g, '&lt;');
          return '<p>' + t + (t.slice(-1) === '.' ? '' : '.') + '</p>';
        }).join('');
      }
      var accEl = document.querySelector('[data-content="practical.accommodation"]');
      if (accEl) accEl.innerHTML = toParagraphs(practical.accommodation);
      var foodEl = document.querySelector('[data-content="practical.foodDietary"]');
      if (foodEl) foodEl.innerHTML = toParagraphs(practical.foodDietary);
      var acc2El = document.querySelector('[data-content="practical.accessibility"]');
      if (acc2El) acc2El.innerHTML = toParagraphs(practical.accessibility);
      var emEl = document.querySelector('[data-content="practical.emergency"]');
      if (emEl) emEl.innerHTML = toParagraphs(practical.emergency);
    }

    var footer = data.footer;
    if (footer) {
      setText(document.querySelector('[data-content="footer.line1"]'), footer.line1);
      setText(document.querySelector('[data-content="footer.copyright"]'), footer.copyright);
      setText(document.querySelector('[data-content="footer.identityNote"]'), footer.identityNote);
    }
  }

  function run() {
    var cfg = window.GA_SHEET_CONFIG || {};
    var load;
    if (cfg.sheetUrl || cfg.sheetId) {
      load = loadFromSheet(cfg);
    } else {
      load = fetch('content/site.json').then(function (r) { return r.ok ? r.json() : null; });
    }
    load.then(apply).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
