document.addEventListener('DOMContentLoaded', function () {
  const startButton = document.getElementById('startButton');
  const output = document.getElementById('output');

  startButton.addEventListener('click', function () {
    chrome.scripting.executeScript({
      target: { tabId: chrome.tabs.TAB_ID_NONE },
      function: startInstagramScript
    });
  });

  function startInstagramScript() {
    (async function () {
      const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

      async function handleOutput(type, data) {
        const styles = ` padding: 0.5rem 0; font-size: 1rem; font-weight: 700; `;
        const getMinutes = () => {
          const steps = Math.floor((data.followingCount - data.currentPageCount) / data.estimatedStepValue);
          const seconds = steps * 3 + Math.floor(steps / 5 * 15);
          const minutes = Math.floor(seconds / 60);
          if (minutes <= 1) return "1 minute";
          else return `${minutes} minutes`;
        };
        if (type === "PROGRESS") {
          console.clear();
          console.warn(`%c실행중! ${data.currentPageCount} 개 중 ${data.followingCount} 개 완료 (${parseInt(data.currentPageCount / data.followingCount * 100)}%) - ETA: ${getMinutes()}`, styles);
        } else if (type === "RATE_LIMIT") {
          console.clear();
          console.warn("%cRATE LIMIT. 15초 후에 다시 실행합니다.", styles);
          await sleep(15000);
        } else if (type === "FINISH") {
          console.clear();
          if (data.unfollowers.length === 0) return console.warn(`%c모든사람이 님 맞팔로우함.`, styles);
          console.group(`%c ${data.unfollowers.length} 명의 유저가 님을 밎팔하지 않습니다.`, styles);
          data.unfollowers.forEach(unfollower => console.log(`${unfollower.username}${unfollower.isVerified ? "!" : ""} - https://www.instagram.com/${unfollower.username}/`));
          console.groupEnd();
        }
      }

      class Script {
        constructor(checkVerifiedUsers) {
          this.checkVerifiedUsers = checkVerifiedUsers;
          this.unfollowers = [];
          this.canQuery = false;
          this.nextPageHash = "";
          this.requestsCount = 0;
          this.followingCount = 0;
          this.currentPageCount = 0;
          this.estimatedStepValue = 0;
        }

        getCookie(cookieName) {
          return new Promise((resolve, reject) => {
            const cookies = document.cookie.split(";");
            for (const cookie of cookies) {
              const pair = cookie.split("=");
              if (pair[0].trim() === cookieName) resolve(decodeURIComponent(pair[1]));
            }
            reject("Cookie not found!");
          });
        }

        createURLParamsString(params) {
          return Object.keys(params).map(key => {
            const value = params[key];
            if (typeof value === "object") return `${key}=${JSON.stringify(value)}`;
            else return `${key}=${value}`;
          }).join("&");
        }

        async generateURL() {
          const params = {
            query_hash: "3dec7e2c57367ef3da3d987d89f9dbc8",
            variables: {
              id: await this.getCookie("ds_user_id"),
              first: "1000"
            };
          if (this.nextPageHash) params.variables.after = this.nextPageHash;
          return `https://www.instagram.com/graphql/query/?${this.createURLParamsString(params)}`;
        }

        async startScript() {
          try {
            do {
              if (this.requestsCount !== 0 && this.requestsCount % 5 === 0) await handleOutput("RATE_LIMIT");
              const url = await this.generateURL();
              const {
                data
              } = await fetch(url).then(res => res.json());
              if (checkVerifiedUsers) {
                data.user.edge_follow.edges.forEach(edge => {
                  if (!edge.node.follows_viewer) this.unfollowers.push({
                    username: edge.node.username,
                    isVerified: edge.node.is_verified
                  });
                });
              } else {
                data.user.edge_follow.edges.forEach(edge => {
                  if (!edge.node.is_verified && !edge.node.follows_viewer) this.unfollowers.push({
                    username: edge.node.username
                  });
                });
              }
              this.canQuery = data.user.edge_follow.page_info.has_next_page;
              this.nextPageHash = data.user.edge_follow.page_info.end_cursor;
              this.requestsCount++;
              this.followingCount = data.user.edge_follow.count;
              this.currentPageCount += data.user.edge_follow.edges.length;
              if (this.estimatedStepValue === 0) this.estimatedStepValue = data.user.edge_follow.edges.length;
              handleOutput("PROGRESS", {
                currentPageCount: this.currentPageCount,
                estimatedStepValue: this.estimatedStepValue,
                followingCount: this.followingCount
              });
              await sleep(3000);
            } while (this.canQuery);
            handleOutput("FINISH", {
              unfollowers: this.unfollowers
            });
          } catch (error) {
            return console.error(`Something went wrong!\n${error}`);
          }
        }
      }

      const checkVerifiedUsers = confirm("맞팔로우 추적기를 실행할까요?");
      const script = new Script(checkVerifiedUsers);
      script.startScript();
    })();
  }
});
