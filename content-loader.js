/**
 * Fetches content from Google Sheets or content/site.json and applies it to the page.
 * Configure sheet-config.js with your Google Sheet ID to use Sheets.
 */
(function () {
  var agendaCalendarUrl = '';

  function setText(el, text) {
    if (el && text != null) el.textContent = text;
  }

  function setAttr(el, name, value) {
    if (el && value != null) el.setAttribute(name, value);
  }

  function setLinkState(el, url) {
    var value = (url || '#').trim();
    if (!el) return;
    el.setAttribute('href', value);
    if (value === '#') {
      el.classList.add('btn-disabled');
      el.setAttribute('aria-disabled', 'true');
    } else {
      el.classList.remove('btn-disabled');
      el.removeAttribute('aria-disabled');
    }
  }

  function parseCSV(text) {
    var rows = [];
    var inQuotes = false;
    var row = [];
    var cell = '';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') inQuotes = !inQuotes;
      else if (!inQuotes && c === ',') {
        row.push(cell.trim());
        cell = '';
      } else if (!inQuotes && c === '\n') {
        row.push(cell.trim());
        rows.push(row);
        row = [];
        cell = '';
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

  function toDriveImageUrl(url) {
    var value = (url || '').trim();
    var match;
    if (!value) return '';

    match = value.match(/^https?:\/\/drive\.google\.com\/file\/d\/([^/]+)/i);
    if (!match) match = value.match(/[?&]id=([^&]+)/i);
    if (!match && /^[a-zA-Z0-9_-]{20,}$/.test(value)) match = [value, value];

    if (match && match[1]) {
      return 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(match[1]) + '&sz=w256';
    }

    return value;
  }

  function getSocialIcon(name) {
    var key = (name || '').trim().toLowerCase();
    if (key === 'instagram') {
      return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" stroke-width="2"></rect><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"></circle><circle cx="17.5" cy="6.5" r="1.25" fill="currentColor"></circle></svg>';
    }
    if (key === 'facebook') {
      return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7h2.6l.4-3h-3V9.1c0-.9.3-1.6 1.6-1.6h1.5V4.8c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 4V11H8v3h2.5v7h3z" fill="currentColor"></path></svg>';
    }
    if (key === 'linkedin') {
      return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9 8.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zM5.3 10.2h3.1V20H5.3zM10.2 10.2h3v1.3h.1c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7V20h-3.1v-4.8c0-1.1 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5V20h-3.1z" fill="currentColor"></path></svg>';
    }
    return '<svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zm2.2-.5L12 11.3 17.8 7zM18 8.4l-5.4 4a1 1 0 0 1-1.2 0L6 8.4v8.1c0 .3.2.5.5.5h11c.3 0 .5-.2.5-.5z" fill="currentColor"></path></svg>';
  }

  function isHidden(value) {
    if (value === true) return true;
    return ((value || '') + '').trim().toUpperCase() === 'TRUE';
  }

  function filterVisible(items) {
    return (Array.isArray(items) ? items : []).filter(function (item) {
      return !isHidden(item && item.hidden);
    });
  }

  function setSectionHidden(name, hidden) {
    var el = document.querySelector('[data-section="' + name + '"]');
    if (el) el.hidden = !!hidden;
  }

  function syncSectionGroupVisibility(selector) {
    var el = document.querySelector(selector);
    var hasVisible = false;
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('[data-section]'), function (child) {
      if (!child.hidden) hasVisible = true;
    });
    el.hidden = !hasVisible;
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function inferAgendaYear(data) {
    var hero = (data && data.hero) || {};
    var chips = Array.isArray(hero.chips) ? hero.chips : [];
    var sources = [];
    var match;
    var i;

    for (i = 0; i < chips.length; i++) {
      sources.push(chips[i] && (chips[i].value != null ? chips[i].value : chips[i]));
    }
    sources.push(hero.title);

    for (i = 0; i < sources.length; i++) {
      match = ((sources[i] || '') + '').match(/\b(20\d{2})\b/);
      if (match) return parseInt(match[1], 10);
    }

    return 2026;
  }

  function parseAgendaDate(dayLabel, fallbackYear) {
    var months = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12
    };
    var value = ((dayLabel || '') + '').replace(/,/g, ' ').trim();
    var match = value.match(/(?:^|\s)(\d{1,2})\s+([A-Za-z]+)(?:\s+(20\d{2}))?/);
    var day;
    var monthKey;
    var year;

    if (!match) return null;

    day = parseInt(match[1], 10);
    monthKey = match[2].toLowerCase();
    year = match[3] ? parseInt(match[3], 10) : fallbackYear;
    if (!months[monthKey]) monthKey = monthKey.slice(0, 3);
    if (!months[monthKey]) return null;

    return {
      year: year,
      month: months[monthKey],
      day: day
    };
  }

  function parseAgendaTime(timeLabel) {
    var value = ((timeLabel || '') + '').trim();
    var match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return {
      hours: parseInt(match[1], 10),
      minutes: parseInt(match[2], 10)
    };
  }

  function formatIcsDate(date) {
    return String(date.year) + pad2(date.month) + pad2(date.day);
  }

  function formatIcsDateTime(date, time) {
    return formatIcsDate(date) + 'T' + pad2(time.hours) + pad2(time.minutes) + '00';
  }

  function addMinutes(time, minutesToAdd) {
    var total = time.hours * 60 + time.minutes + minutesToAdd;
    return {
      hours: Math.floor(total / 60),
      minutes: total % 60
    };
  }

  function nextDate(date) {
    var jsDate = new Date(date.year, date.month - 1, date.day);
    jsDate.setDate(jsDate.getDate() + 1);
    return {
      year: jsDate.getFullYear(),
      month: jsDate.getMonth() + 1,
      day: jsDate.getDate()
    };
  }

  function escapeIcsText(value) {
    return ((value || '') + '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function createAgendaCalendar(data, agendaItems) {
    var year = inferAgendaYear(data);
    var venueList = filterVisible(data && data.venues);
    var venue = (data && data.venue) || {};
    var firstVenue = venueList[0] || null;
    var locationParts = [];
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ESN GA 2026//EN',
      'NAME:ESN General Assembly 2026',
      'X-WR-CALNAME:ESN General Assembly 2026',
      'X-WR-TIMEZONE:Europe/Prague',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Prague',
      'BEGIN:STANDARD',
      'DTSTART:20251026T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'END:STANDARD',
      'BEGIN:DAYLIGHT',
      'DTSTART:20260329T020000',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'END:DAYLIGHT',
      'END:VTIMEZONE'
    ];
    var dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    var i;

    if (firstVenue) {
      locationParts = [firstVenue.name, firstVenue.addressLine1, firstVenue.addressLine2, firstVenue.cityPostal].filter(Boolean);
    } else {
      locationParts = [venue.venueName, venue.addressLine1, venue.addressLine2, venue.cityPostal].filter(Boolean);
    }

    for (i = 0; i < agendaItems.length; i++) {
      var item = agendaItems[i];
      var parsedDate = parseAgendaDate(item.day, year);
      var parsedTime = parseAgendaTime(item.time);
      var nextItem = agendaItems[i + 1];
      var nextTime = nextItem && nextItem.day === item.day ? parseAgendaTime(nextItem.time) : null;
      var uidBase;

      if (!parsedDate) continue;

      uidBase = formatIcsDate(parsedDate) + '-' + ((item.title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'event') + '-' + i;
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uidBase + '@esn');
      lines.push('DTSTAMP:' + dtStamp);

      if (!parsedTime) {
        lines.push('DTSTART;VALUE=DATE:' + formatIcsDate(parsedDate));
        lines.push('DTEND;VALUE=DATE:' + formatIcsDate(nextDate(parsedDate)));
      } else {
        lines.push('DTSTART;TZID=Europe/Prague:' + formatIcsDateTime(parsedDate, parsedTime));
        lines.push('DTEND;TZID=Europe/Prague:' + formatIcsDateTime(parsedDate, nextTime || addMinutes(parsedTime, 60)));
      }

      lines.push('SUMMARY:' + escapeIcsText(item.title || 'Agenda item'));
      if (locationParts.length) lines.push('LOCATION:' + escapeIcsText(locationParts.join(', ')));
      if (item.description) lines.push('DESCRIPTION:' + escapeIcsText(item.description));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function setAgendaCalendarDownload(data, agendaItems) {
    var link = document.querySelector('.agenda-controls a[download]');
    if (!link) return;

    if (agendaCalendarUrl) {
      URL.revokeObjectURL(agendaCalendarUrl);
      agendaCalendarUrl = '';
    }

    if (!agendaItems.length) {
      link.setAttribute('href', 'ga2026.ics');
      link.setAttribute('download', 'ga2026.ics');
      return;
    }

    agendaCalendarUrl = URL.createObjectURL(new Blob([createAgendaCalendar(data, agendaItems)], { type: 'text/calendar;charset=utf-8' }));
    link.setAttribute('href', agendaCalendarUrl);
    link.setAttribute('download', 'ga2026.ics');
  }

  function loadFromSheet(cfg) {
    var url = cfg.sheetUrl || ('https://docs.google.com/spreadsheets/d/' + cfg.sheetId + '/pub?output=csv&gid=' + (cfg.gid || 0));
    return fetchUrl(url).then(function (text) {
      if (!text) return null;
      var rows = parseCSV(text);
      var data = {
        hero: {},
        about: {},
        agenda: {
          title: 'Agenda',
          intro: 'Schedule is indicative and subject to change. Times are placeholders.',
          items: []
        },
        venue: {},
        sections: {
          about: { hidden: false },
          agenda: { hidden: false },
          venue: { hidden: false },
          contacts: { hidden: false },
          social: { hidden: false },
          faq: { hidden: false },
          documents: { hidden: false },
          sponsors: { hidden: false },
          localsRecommend: { hidden: false }
        },
        venues: [],
        contacts: [],
        social: [],
        contactsLegacy: {},
        socialLegacy: {},
        practical: {},
        footer: {},
        faq: [],
        documents: [],
        sponsors: [],
        localsRecommend: []
      };
      var section = 'config';
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        var a0 = (r[0] || '').trim();
        var a1 = (r[1] || '').trim();
        if (a0 === '[AGENDA]') { section = 'agenda'; continue; }
        if (a0 === '[FAQ]') { section = 'faq'; continue; }
        if (a0 === '[DOCUMENTS]') { section = 'documents'; continue; }
        if (a0 === '[SPONSORS]') { section = 'sponsors'; continue; }
        if (a0 === '[LOCALS_RECOMMEND]') { section = 'localsRecommend'; continue; }
        if (a0 === '[CONTACTS]') { section = 'contacts'; continue; }
        if (a0 === '[SOCIAL]') { section = 'social'; continue; }
        if (a0 === '[VENUES]') { section = 'venues'; continue; }
        if (section === 'config' && a0 && a0 !== 'key') {
          if (a0 === 'hero.title') data.hero.title = a1;
          else if (a0 === 'hero.subtitle') data.hero.subtitle = a1;
          else if (a0 === 'hero.chips') data.hero.chips = a1 ? a1.split(';').map(function (v) { return { value: v.trim() }; }) : [];
          else if (a0 === 'hero.infoPackUrl') data.hero.infoPackUrl = a1;
          else if (a0 === 'hero.contactUrl') data.hero.contactUrl = a1;
          else if (a0 === 'about.title') data.about.title = a1;
          else if (a0 === 'about.items') data.about.items = a1 ? a1.split(';').map(function (v) { return { value: v.trim() }; }) : [];
          else if (a0 === 'about.hidden') data.sections.about.hidden = isHidden(a1);
          else if (a0 === 'agenda.title') data.agenda.title = a1;
          else if (a0 === 'agenda.intro') data.agenda.intro = a1;
          else if (a0 === 'agenda.hidden') data.sections.agenda.hidden = isHidden(a1);
          else if (a0 === 'venue.title') data.venue.title = a1;
          else if (a0 === 'venue.venueName') data.venue.venueName = a1;
          else if (a0 === 'venue.addressLine1') data.venue.addressLine1 = a1;
          else if (a0 === 'venue.addressLine2') data.venue.addressLine2 = a1;
          else if (a0 === 'venue.cityPostal') data.venue.cityPostal = a1;
          else if (a0 === 'venue.mapEmbedUrl') data.venue.mapEmbedUrl = a1;
          else if (a0 === 'venue.campusMapImage') data.venue.campusMapImage = a1;
          else if (a0 === 'venue.gettingThere') data.venue.gettingThere = a1;
          else if (a0 === 'venue.hidden') data.sections.venue.hidden = isHidden(a1);
          else if (a0 === 'contacts.hidden') data.sections.contacts.hidden = isHidden(a1);
          else if (a0 === 'social.hidden') data.sections.social.hidden = isHidden(a1);
          else if (a0 === 'faq.hidden') data.sections.faq.hidden = isHidden(a1);
          else if (a0 === 'documents.hidden') data.sections.documents.hidden = isHidden(a1);
          else if (a0 === 'sponsors.hidden') data.sections.sponsors.hidden = isHidden(a1);
          else if (a0 === 'localsRecommend.hidden') data.sections.localsRecommend.hidden = isHidden(a1);
          else if (a0 === 'contacts.ocEmail') data.contactsLegacy.ocEmail = a1;
          else if (a0 === 'contacts.venueContact') data.contactsLegacy.venueContact = a1;
          else if (a0 === 'social.instagram') data.socialLegacy.instagram = a1;
          else if (a0 === 'social.facebook') data.socialLegacy.facebook = a1;
          else if (a0 === 'social.linkedin') data.socialLegacy.linkedin = a1;
          else if (a0 === 'practical.accommodation') data.practical.accommodation = a1;
          else if (a0 === 'practical.foodDietary') data.practical.foodDietary = a1;
          else if (a0 === 'practical.accessibility') data.practical.accessibility = a1;
          else if (a0 === 'practical.emergency') data.practical.emergency = a1;
          else if (a0 === 'footer.line1') data.footer.line1 = a1;
          else if (a0 === 'footer.copyright') data.footer.copyright = a1;
          else if (a0 === 'footer.identityNote') data.footer.identityNote = a1;
        } else if (section === 'agenda' && a0 !== 'day' && (a0 || a1 || r[2] || r[3] || r[4])) {
          data.agenda.items.push({
            day: (a0 || '').trim(),
            time: (a1 || '').trim(),
            title: (r[2] || '').trim(),
            description: (r[3] || '').trim(),
            hidden: r[4]
          });
        } else if (section === 'faq' && a0 !== 'question' && (a0 || a1 || r[2])) {
          data.faq.push({ question: a0, answer: a1, hidden: r[2] });
        } else if (section === 'documents' && a0 !== 'title' && a0) {
          data.documents.push({ title: a0, description: a1, url: (r[2] || '#').trim(), linkText: (r[3] || 'Download / View').trim(), hidden: r[4] });
        } else if (section === 'sponsors' && a0 !== 'name' && (a0 || a1)) {
          data.sponsors.push({ name: a0, logoUrl: (a1 || '').trim(), url: (r[2] || '').trim(), hidden: r[3] });
        } else if (section === 'localsRecommend' && a0 !== 'name' && a0) {
          data.localsRecommend.push({ name: a0, description: a1, category: (r[2] || '').trim(), url: (r[3] || '#').trim(), linkText: (r[4] || 'View on map').trim(), hidden: r[5] });
        } else if (section === 'venues' && a0 !== 'name' && (a0 || a1 || r[2] || r[3] || r[4] || r[5])) {
          data.venues.push({
            name: (a0 || '').trim(),
            mapUrl: (a1 || '#').trim(),
            addressLine1: (r[2] || '').trim(),
            addressLine2: (r[3] || '').trim(),
            cityPostal: (r[4] || '').trim(),
            hidden: r[5]
          });
        } else if (section === 'contacts' && a0 !== 'picture' && (a0 || a1 || r[2] || r[3] || r[4] || r[5])) {
          data.contacts.push({
            picture: (a0 || '').trim(),
            group: (a1 || '').trim(),
            name: (r[2] || '').trim(),
            email: (r[3] || '').trim(),
            phone: (r[4] || '').trim(),
            hidden: r[5]
          });
        } else if (section === 'social' && a0 !== 'name' && a0) {
          data.social.push({ name: a0, url: (a1 || '#').trim(), hidden: r[2] });
        }
      }
      return data;
    });
  }

  function apply(data) {
    if (!data) return;
    var sections = data.sections || {};

    function sectionIsHidden(name) {
      return isHidden(sections[name] && sections[name].hidden);
    }

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
      setLinkState(document.querySelector('[data-content-href="hero.infoPackUrl"]'), hero.infoPackUrl);
      setLinkState(document.querySelector('[data-content-href="hero.contactUrl"]'), hero.contactUrl);
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
    setSectionHidden('about', sectionIsHidden('about'));

    var agenda = data.agenda || {};
    setText(document.querySelector('[data-content="agenda.title"]'), agenda.title);
    setText(document.querySelector('[data-content="agenda.intro"]'), agenda.intro);
    var rawAgendaItems = Array.isArray(agenda.items) ? agenda.items : [];
    var agendaItems = filterVisible(rawAgendaItems);
    var agendaDaysEl = document.querySelector('[data-content="agendaDays"]');
    if (agendaDaysEl && agendaItems.length > 0) {
      var groupedAgenda = [];
      var groupMap = {};
      agendaItems.forEach(function (item) {
        var day = (item.day || '').trim() || 'Agenda';
        if (!groupMap[day]) {
          groupMap[day] = { day: day, items: [] };
          groupedAgenda.push(groupMap[day]);
        }
        groupMap[day].items.push(item);
      });
      agendaDaysEl.innerHTML = groupedAgenda.map(function (group, index) {
        var dayLabel = group.day.replace(/</g, '&lt;');
        var accentClass = ['agenda-accent-cyan', 'agenda-accent-orange', 'agenda-accent-magenta', 'agenda-accent-green'][index % 4];
        var itemsHtml = group.items.map(function (item) {
          var time = (item.time || '').replace(/</g, '&lt;');
          var title = (item.title || '').replace(/</g, '&lt;');
          var description = (item.description || '').replace(/</g, '&lt;');
          return '<li class="agenda-list-item">' +
            '<span class="agenda-item-time">' + time + '</span>' +
            '<div class="agenda-item-body">' +
            '<span class="agenda-item-title">' + title + '</span>' +
            (description ? '<span class="agenda-item-description">' + description + '</span>' : '') +
            '</div>' +
            '</li>';
        }).join('');
        return '<details class="agenda-day-group ' + accentClass + '">' +
          '<summary class="agenda-day-group-title">' +
          '<span>' + dayLabel + '</span>' +
          '<span class="agenda-day-count">' + group.items.length + ' items</span>' +
          '</summary>' +
          '<div class="agenda-day-group-body">' +
          '<ol class="agenda-list">' + itemsHtml + '</ol>' +
          '</div>' +
          '</details>';
      }).join('');
    }
    setAgendaCalendarDownload(data, agendaItems);
    setSectionHidden('agenda', sectionIsHidden('agenda') || (rawAgendaItems.length > 0 && agendaItems.length === 0));

    var venue = data.venue;
    if (venue) {
      setText(document.querySelector('[data-content="venue.title"]'), venue.title);
      var mapIframe = document.querySelector('[data-content="venue.mapEmbedUrl"]');
      if (mapIframe) mapIframe.setAttribute('src', venue.mapEmbedUrl || '');
      var campusImg = document.querySelector('[data-content="venue.campusMapImage"]');
      if (campusImg && venue.campusMapImage) {
        campusImg.setAttribute('src', venue.campusMapImage);
        var pic = campusImg.closest('picture');
        if (pic) {
          var webpSrc = venue.campusMapImage.replace(/\.(png|jpe?g)$/i, '.webp');
          var srcEl = pic.querySelector('source[type="image/webp"]');
          if (srcEl) srcEl.setAttribute('srcset', webpSrc);
        }
      }
      var gettingThere = document.querySelector('[data-content="venue.gettingThere"]');
      if (gettingThere && venue.gettingThere) {
        var ps = venue.gettingThere.split(/\.\s+/).filter(Boolean);
        gettingThere.innerHTML = ps.map(function (p) { return '<p>' + p.replace(/</g, '&lt;') + '</p>'; }).join('');
      }
    }

    var venues = filterVisible(data.venues);
    if (venues.length === 0 && venue && (venue.venueName || venue.addressLine1 || venue.addressLine2 || venue.cityPostal)) {
      venues.push({
        name: venue.venueName || '',
        mapUrl: '#',
        addressLine1: venue.addressLine1 || '',
        addressLine2: venue.addressLine2 || '',
        cityPostal: venue.cityPostal || ''
      });
    }
    var venueListEl = document.querySelector('[data-content="venues"]');
    if (venueListEl) {
      venueListEl.innerHTML = venues.map(function (item) {
        var name = (item.name || '').replace(/</g, '&lt;');
        var mapUrl = (item.mapUrl || '#').trim();
        var addressLine1 = (item.addressLine1 || '').replace(/</g, '&lt;');
        var addressLine2 = (item.addressLine2 || '').replace(/</g, '&lt;');
        var cityPostal = (item.cityPostal || '').replace(/</g, '&lt;');
        var mapAttrs = mapUrl === '#'
          ? 'class="btn btn-secondary btn-disabled" href="#" aria-disabled="true"'
          : 'class="btn btn-secondary" href="' + (mapUrl + '').replace(/"/g, '&quot;') + '" target="_blank" rel="noopener"';
        return '<div class="card">' +
          '<h3>' + name + '</h3>' +
          (addressLine1 ? '<p>' + addressLine1 + '</p>' : '') +
          (addressLine2 ? '<p>' + addressLine2 + '</p>' : '') +
          (cityPostal ? '<p>' + cityPostal + '</p>' : '') +
          '<div class="btn-row"><a ' + mapAttrs + '>Open in Maps</a></div>' +
          '</div>';
      }).join('');
    }
    setSectionHidden('venue', sectionIsHidden('venue') || venues.length === 0);

    var contacts = data.contacts;
    var contactListEl = document.querySelector('[data-content="contactsList"]');
    if (Array.isArray(contacts) && contacts.length === 0 && (data.contactsLegacy.ocEmail || data.contactsLegacy.venueContact)) {
      contacts = [
        { picture: '', group: 'Organising Committee', name: '', email: data.contactsLegacy.ocEmail || '', phone: '' },
        { picture: '', group: 'Venue Contact', name: '', email: data.contactsLegacy.venueContact || '', phone: '' }
      ];
    }
    contacts = filterVisible(contacts);
    if (contactListEl) {
      contactListEl.innerHTML = contacts.map(function (c) {
        var picture = toDriveImageUrl(c.picture);
        var group = (c.group || '').replace(/</g, '&lt;');
        var rawName = (c.name || '').trim();
        var name = rawName.replace(/</g, '&lt;');
        var email = (c.email || '').replace(/</g, '&lt;');
        var phone = (c.phone || '').replace(/</g, '&lt;');
        var fallbackInitial = (rawName ? rawName.charAt(0).toUpperCase() : '?').replace(/</g, '&lt;');
        var imgHtml = picture
          ? '<img src="' + (picture + '').replace(/"/g, '&quot;') + '" alt="" loading="lazy" class="contact-avatar-img" />'
          : '<span class="contact-avatar-placeholder" aria-hidden="true">' + fallbackInitial + '</span>';
        var emailHtml = email ? '<a href="mailto:' + (email + '').replace(/"/g, '&quot;') + '">' + email + '</a>' : '';
        var phoneHtml = phone ? '<a href="tel:' + (phone + '').replace(/[^0-9+]/g, '') + '">' + phone + '</a>' : '';
        return '<li class="contact-item">' +
          '<div class="contact-avatar" data-fallback-initial="' + fallbackInitial.replace(/"/g, '&quot;') + '">' + imgHtml + '</div>' +
          '<div class="contact-details">' +
          '<span class="contact-group">' + group + '</span>' +
          '<span class="contact-name">' + name + '</span>' +
          (emailHtml ? '<span class="contact-email">' + emailHtml + '</span>' : '') +
          (phoneHtml ? '<span class="contact-phone">' + phoneHtml + '</span>' : '') +
          '</div></li>';
      }).join('');

      Array.prototype.forEach.call(contactListEl.querySelectorAll('.contact-avatar-img'), function (img) {
        img.addEventListener('error', function () {
          var avatar = img.parentNode;
          var initial = avatar && avatar.getAttribute('data-fallback-initial');
          if (!avatar) return;
          avatar.innerHTML = '<span class="contact-avatar-placeholder" aria-hidden="true">' + (initial || '?') + '</span>';
        }, { once: true });
      });
    }
    setSectionHidden('contacts', sectionIsHidden('contacts') || contacts.length === 0);

    var social = data.social;
    var socialListEl = document.querySelector('[data-content="socialList"]');
    if (Array.isArray(social) && social.length === 0 && (data.socialLegacy.instagram || data.socialLegacy.facebook || data.socialLegacy.linkedin)) {
      social = [
        { name: 'Instagram', url: data.socialLegacy.instagram || '#' },
        { name: 'Facebook', url: data.socialLegacy.facebook || '#' },
        { name: 'LinkedIn', url: data.socialLegacy.linkedin || '#' }
      ];
    }
    social = filterVisible(social);
    if (socialListEl) {
      socialListEl.innerHTML = social.map(function (s) {
        var rawName = (s.name || '').trim();
        var name = rawName.replace(/</g, '&lt;');
        var url = (s.url || '#').trim();
        var attrs = url === '#' ? 'class="social-link btn-disabled" href="#" aria-disabled="true"' : 'class="social-link" href="' + (url + '').replace(/"/g, '&quot;') + '" target="_blank" rel="noopener"';
        return '<p><a ' + attrs + '>' + getSocialIcon(rawName) + '<span>' + name + '</span></a></p>';
      }).join('');
    }
    setSectionHidden('social', sectionIsHidden('social') || social.length === 0);

    var sponsors = filterVisible(data.sponsors);
    var sponsorGrid = document.querySelector('[data-content="sponsors"]');
    if (sponsorGrid) {
      sponsorGrid.innerHTML = sponsors.map(function (s) {
        var n = (s && s.name != null ? s.name : s) || '';
        var logoUrlRaw = (s && s.logoUrl) ? (s.logoUrl + '') : '';
        var logoUrl = toDriveImageUrl(logoUrlRaw).replace(/"/g, '&quot;');
        var url = (s && s.url && s.url !== '#') ? (s.url + '').replace(/"/g, '&quot;') : '';
        var nameEsc = n.replace(/</g, '&lt;');
        var inner = logoUrl
          ? '<img src="' + logoUrl + '" alt="' + nameEsc + '" loading="lazy" />'
          : '<span>' + nameEsc + '</span>';
        var wrap = url ? '<a class="sponsor-logo sponsor-link" href="' + url + '" target="_blank" rel="noopener">' + inner + '</a>' : '<div class="sponsor-logo">' + inner + '</div>';
        return wrap;
      }).join('');
    }
    setSectionHidden('sponsors', sectionIsHidden('sponsors') || sponsors.length === 0);

    var faq = filterVisible(data.faq);
    var faqContainer = document.querySelector('[data-content="faq"]');
    if (faqContainer) {
      faqContainer.innerHTML = faq.map(function (item) {
        var q = (item.question || '').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        var a = (item.answer || '').replace(/</g, '&lt;');
        return '<details><summary>' + q + '</summary><div class="accordion-content">' + a + '</div></details>';
      }).join('');
    }
    setSectionHidden('faq', sectionIsHidden('faq') || faq.length === 0);

    var localsRecommend = filterVisible(data.localsRecommend);
    var localsContainer = document.querySelector('[data-content="localsRecommend"]');
    if (localsContainer) {
      localsContainer.innerHTML = localsRecommend.map(function (p) {
        var name = (p.name || '').replace(/</g, '&lt;');
        var desc = (p.description || '').replace(/</g, '&lt;');
        var cat = (p.category || '').replace(/</g, '&lt;');
        var url = p.url || '#';
        var linkText = (p.linkText || 'View on map').replace(/</g, '&lt;');
        var disabled = url === '#' ? ' btn-disabled" href="#" aria-disabled="true"' : '" href="' + (url + '').replace(/"/g, '&quot;') + '"';
        return '<div class="card doc-card"><span class="place-category">' + cat + '</span><h3>' + name + '</h3><p>' + desc + '</p><a class="btn btn-secondary' + disabled + '>' + linkText + '</a></div>';
      }).join('');
    }
    setSectionHidden('localsRecommend', sectionIsHidden('localsRecommend') || localsRecommend.length === 0);

    var documents = filterVisible(data.documents);
    var docContainer = document.querySelector('[data-content="documents"]');
    if (docContainer) {
      docContainer.innerHTML = documents.map(function (d) {
        var title = (d.title || '').replace(/</g, '&lt;');
        var desc = (d.description || '').replace(/</g, '&lt;');
        var url = d.url || '#';
        var linkText = (d.linkText || 'Download / View').replace(/</g, '&lt;');
        var disabled = url === '#' ? ' btn-disabled" href="#" aria-disabled="true"' : '" href="' + (url + '').replace(/"/g, '&quot;') + '"';
        return '<div class="card doc-card"><h3>' + title + '</h3><p>' + desc + '</p><a class="btn' + disabled + '>' + linkText + '</a></div>';
      }).join('');
    }
    setSectionHidden('documents', sectionIsHidden('documents') || documents.length === 0);
    syncSectionGroupVisibility('#contacts');

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
