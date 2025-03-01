# AugmentOS-Cloud-Example-App

![New Project](https://github.com/user-attachments/assets/8eaf26d6-595e-470e-a48d-0a5310799e4e)


### Set up ngrok

1. `brew install ngrok`

2. Make an ngrok account

3. [Use ngrok to make a static address/URL](https://dashboard.ngrok.com/)

### Register your APP with AugmentOS

<img width="181" alt="image" src="https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318" />

1. Navigate to [AugmentOS.dev](https://augmentos.dev/)

2. Click "Sign In", and log in with the same Google account you're using for AugmentOS

3. Click "Create App"

4. Set a UNIQUE package name like `org.yourlastname.yoursocialsecuritynumber`

5. For webhook url, enter your ngrok's static url, appended by `webhook`
    * EX: 
        * If you Ngrok URL is: `https://my-static-url.ngrok-free.app`
        * Then you enter `https://my-static-url.ngrok-free.app/webhook`

### Get your APP running!

1. [Install bun](https://bun.sh/docs/installation)

2. Clone this repo: `git clone git@github.com:AugmentOS-Community/AugmentOS-Cloud-Example-App.git`

3. cd into your repo, then type `bun install`

4. Edit your `index.ts` to match the app you registered at [AugmentOS.dev](https://augmentos.dev/)
    
```typescript
const app = new ExampleAugmentOSApp({
  packageName: 'org.yourlastname.yoursocialsecuritynumber', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, can be anything
  port: 3000, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://dev.augmentos.org/tpa-ws' //AugmentOS url
});
```

7. Run your app with `bun start index.ts`

8. To expose your app to the internet (and thus AugmentOS) with ngrok, run: `ngrok http --url=civil-frankly-javelin.ngrok-free.app 3000`
    * `3000` is the port. It must match what is in the app config. If you entered `port: 8080`, use `8080` for ngrok instead.
