import { TpaServer, TpaSession } from '@augmentos/sdk';

class ExampleAugmentOSApp extends TpaServer {
  protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
    // Show welcome message
    session.layouts.showTextWall("Example Captions App Ready!");

    // Handle real-time transcription
    const cleanup = [
      session.events.onTranscription((data) => {
        session.layouts.showTextWall(data.text, {
          durationMs: data.isFinal ? 3000 : undefined
        });
      }),

      session.events.onPhoneNotifications((data) => {}),

      session.events.onGlassesBattery((data) => {}),

      session.events.onError((error) => {
        console.error('Error:', error);
      })
    ];

    // Add cleanup handlers
    cleanup.forEach(handler => this.addCleanupHandler(handler));
  }
}

// Start the server
// DEV CONSOLE URL: https://augmentos.dev/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleAugmentOSApp({
  packageName: 'org.augmentos.exampleapp', // make sure this matches your app in dev console
  apiKey: 'your_api_key', // Not used right now, play nice
  port: 3000, // The port you're hosting the server on
  augmentOSWebsocketUrl: 'wss://dev.augmentos.org/tpa-ws' //AugmentOS url
});

app.start().catch(console.error);