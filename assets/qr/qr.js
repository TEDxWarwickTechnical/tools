(() => {
  'use strict';

  const GitHub = {
    isAuthenticated: false,
    authUser: null,
    authToken: null,
    baseURL: 'https://api.github.com',

    fetch: (endpoint, options = {}) => {
      if (GitHub.isAuthenticated) {
        if (!options.hasOwnProperty('headers') || !options.headers) {
          options.headers = new Headers();
        }

        const authToken = btoa(`${GitHub.authUser}:${GitHub.authToken}`)

        options.headers.set('Authorization', `Basic ${authToken}`)
      }

      options.cache = 'no-cache';

      return fetch(GitHub.baseURL + endpoint, options);
    },

    testAuthentication: () => new Promise((resolve, reject) => {
      GitHub.fetch('/rate_limit', {
        // Options
      }).then(response => {
        response.json().then(json => {
          GitHub.isAuthenticated = response.status === 200 && GitHub.authUser && GitHub.authToken;
          resolve(GitHub.usageFromHeaders(response.headers));
        });
      }).catch(reason => {
        reject(reason);
      });
    }),

    getAuthFromStorage: () => {
      const user = localStorage.getItem('github/auth/user');
      const token = localStorage.getItem('github/auth/token');

      if (user === null || token === null) {
        return null;
      } else {
        return { user, token };
      }
    },

    saveAuthToStorage: (user, token) => {
      if (GitHub.isAuthenticated) {
        localStorage.setItem('github/auth/user', user);
        localStorage.setItem('github/auth/token', token);
      } else {
        localStorage.removeItem('github/auth/user');
        localStorage.removeItem('github/auth/token');
      }
    },

    usageFromHeaders: (headers) => ({
      limit: headers.get('X-RateLimit-Limit'),
      remaining: headers.get('X-RateLimit-Remaining'),
      reset: parseInt(headers.get('X-RateLimit-Reset')),
    }),

    usageString: ({ remaining, reset, limit }) => {
      const rawTime = new Date(reset * 1000);

      const hours = rawTime.getHours();
      const minutes = ('0' + rawTime.getMinutes()).substr(-2);
      const seconds = ('0' + rawTime.getSeconds()).substr(-2);

      const time = `${hours}:${minutes}:${seconds}`;

      return `Remaining requests: ${remaining} of ${limit} (Resets at ${time})`;
    },
  };

  const QR = {
    fromURL: url => {
      const qr = qrcode(0, 'H');
      qr.addData(url);
      qr.make();
      return qr;
    },

    draw: (qr, dest) => {
      document.getElementById(dest).innerHTML = '';

      const size = qr.getModuleCount();

      const svg = SVG(dest).viewbox(-4, -4, size + 8, size + 8).size(200, 200);
      svg.rect(size + 8, size + 8).move(-4, -4).fill('#ffffff');

      const grid = [];

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (qr.isDark(x, y)) {
            grid.push(`M${x},${y}`, 'h1', 'v1', 'h-1', 'v-1');
          }
        }
      }

      svg.defs().path(grid.join('')).id('qr');

      const xScale = 4;

      svg.defs()
         .path('M0,0H4L6,3L8,0H12L8,6L12,12H8L6,9L4,12H0L4,6Z')
         // .scale(size / 12, size / 12)
         // .translate(0, 0)
         .scale((size - (2 * xScale)) / 12, (size - (2 * xScale)) / 12)
         .translate(xScale, xScale)
         .id('x');

      const blackMask = svg.mask().id('black-mask')
      blackMask.rect(size, size).fill('#ffffff');
      blackMask.use('x').fill('#000000').stroke({ color: '#000000', width: 0 });

      const redMask = svg.mask().id('red-mask');
      redMask.rect(size, size).fill('#000000');
      redMask.use('x').fill('#ffffff');

      svg.use('qr').fill('#000000').maskWith(blackMask);
      svg.use('qr').fill('#da291c').maskWith(redMask);
    },
  };

  const updateLinkList = () => new Promise((resolve, reject) => {
    const select = document.getElementById('link-list-select');
    const stats = document.getElementById('link-list-stats');

    select.disabled = true;
    select.innerHTML = '';
    stats.innerHTML = '';

    const option = document.createElement('option');
    option.innerHTML = 'Loading&hellip;'
    select.appendChild(option);

    GitHub.fetch('/repos/TEDxWarwickTechnical/go/contents/_links', {
      // Options
    }).then(response => {
      stats.innerText = GitHub.usageString(GitHub.usageFromHeaders(response.headers));

      response.json().then(json => {
        console.log(json);

        if (response.status === 200) {
          const links = json.map(link => link.name.split('.')[0]);

          select.innerHTML = '';

          links.forEach(link => {
            const option = document.createElement('option');
            option.setAttribute('name', link);
            option.innerHTML = link;
            select.appendChild(option);
          });

          select.disabled = false;

          resolve();
        } else {
          select.innerHTML = '';

          const option = document.createElement('option');
          option.innerHTML = '&lt;Not loaded&gt;'
          select.appendChild(option);

          stats.innerText = json.message;

          reject(json.message);
        }
      });
  }).catch(reason => {
    select.innerHTML = '';

    const option = document.createElement('option');
    option.innerHTML = '&lt;Not loaded&gt;'
    select.appendChild(option);

    stats.innerText = reason;

    reject(reason);
    });
  });

  function ready() {
    const readyCheck = () => ['interactive', 'complete'].includes(document.readyState);

    return new Promise(resolve => {
      if (readyCheck()) {
        resolve();
      } else {
        document.onreadystatechange = () => {
          if (readyCheck()) {
            document.onreadystatechange = null;
            resolve();
          }
        }
      }
    });
  }

  ready().then(() => {
    document.getElementById('github-auth-form').addEventListener('submit', e => {
      e.preventDefault();

      const user = document.getElementById('github-auth-user');
      const token = document.getElementById('github-auth-token');
      const stats = document.getElementById('github-auth-stats');
      const usageStats = document.getElementById('link-list-stats');

      e.target.disabled = true;
      user.disabled = true;
      token.disabled = true;

      let userVal = user.value.trim();
      let tokenVal = token.value.trim();

      if (!userVal || !tokenVal) {
        userVal = null;
        tokenVal = null;
      }

      GitHub.authUser = userVal;
      GitHub.authToken = tokenVal;
      GitHub.testAuthentication()
          .then(usage => {
            usageStats.innerText = GitHub.usageString(usage);
            GitHub.saveAuthToStorage(userVal, tokenVal);
          })
          .catch(reason => {
            console.log(reason);
          })
          .finally(() => {
            e.target.disabled = false;
            user.disabled = false;
            token.disabled = false;
          });
    });

    document.getElementById('link-list-reload').addEventListener('click', e => {
      e.target.disabled = true;
      updateLinkList().finally(() => e.target.disabled = false);
    });

    document.getElementById('qr-generate').addEventListener('click', e => {
      const dlSVG = document.getElementById('qr-download-svg');

      e.target.disabled = true;
      dlSVG.disabled = true;
      dlSVG.removeAttribute('href');

      const preview = document.getElementById('qr-preview');
      const slug = document.getElementById('link-list-select').value;

      QR.draw(QR.fromURL(`https://go.tedxw.co/${slug}`), 'qr-preview');

      const svgText = document.getElementById('qr-preview').innerHTML;
      const svgBlob = new Blob([ svgText ], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      dlSVG.href = svgUrl;
      dlSVG.download = `tedxwarwick-qrcode-${slug}.svg`;

      e.target.disabled = false;
      dlSVG.disabled = false;
    });

    const auth = GitHub.getAuthFromStorage();
    if (auth !== null) {
      GitHub.authUser = auth.user;
      GitHub.authToken = auth.token;
      GitHub.isAuthenticated = true;
      document.getElementById('github-auth-user').value = auth.user;
      document.getElementById('github-auth-token').value = auth.token;
    }

    updateLinkList();
  });
})();
