// Test email fixtures for categorization and todo extraction testing

export const testEmails = {
  // Newsletter emails
  newsletter: [
    {
      id: 'newsletter-1',
      subject: 'TechCrunch Weekly Newsletter - January Edition',
      sender: 'newsletter@techcrunch.com',
      body: `
        This week in tech:
        
        - AI startup raises $100M in Series A
        - New smartphone launches with breakthrough camera
        - Cryptocurrency market update
        
        Thanks for reading! 
        
        Unsubscribe: https://techcrunch.com/unsubscribe?token=abc123
        Update preferences: https://techcrunch.com/preferences
      `,
      receivedAt: new Date('2024-01-15T10:00:00Z'),
      expectedCategory: 'newsletter',
      expectedIsNewsletter: true,
      expectedTodos: 0
    },
    {
      id: 'newsletter-2', 
      subject: 'Your Weekly Digest from Medium',
      sender: 'digest@medium.com',
      body: `
        Top stories this week:
        
        1. How to Build Better APIs
        2. The Future of Remote Work
        3. Machine Learning for Beginners
        
        View in browser | Unsubscribe | Manage preferences
      `,
      receivedAt: new Date('2024-01-16T08:00:00Z'),
      expectedCategory: 'newsletter',
      expectedIsNewsletter: true,
      expectedTodos: 0
    }
  ],

  // Work emails with todos
  work: [
    {
      id: 'work-1',
      subject: 'Action Required: Q4 Reports Due Friday',
      sender: 'manager@company.com',
      body: `
        Hi Team,
        
        Please complete the following by Friday EOD:
        
        1. Submit your Q4 performance report
        2. Review the attached budget proposal 
        3. Schedule your 1-on-1 meeting for next week
        
        Let me know if you have any questions.
        
        Thanks,
        Sarah
      `,
      receivedAt: new Date('2024-01-10T09:00:00Z'),
      expectedCategory: 'work',
      expectedIsNewsletter: false,
      expectedTodos: 3,
      expectedPriority: 'high'
    },
    {
      id: 'work-2',
      subject: 'URGENT: Server Maintenance Tonight',
      sender: 'devops@company.com', 
      body: `
        URGENT: Emergency server maintenance scheduled for tonight 11 PM - 2 AM PST.
        
        Action items:
        - Notify your team about the downtime
        - Backup any critical work before 11 PM
        - Test systems after 2 AM tomorrow
        
        Contact me immediately if you have concerns.
      `,
      receivedAt: new Date('2024-01-12T15:30:00Z'),
      expectedCategory: 'work',
      expectedIsNewsletter: false,
      expectedTodos: 3,
      expectedPriority: 'urgent'
    }
  ],

  // Personal emails
  personal: [
    {
      id: 'personal-1',
      subject: 'Birthday Party Invitation',
      sender: 'friend@gmail.com',
      body: `
        Hey!
        
        You're invited to my birthday party next Saturday at 7 PM.
        Location: My house (123 Main St)
        
        Please RSVP by Thursday so I can plan accordingly.
        Hope to see you there!
        
        Best,
        Alex
      `,
      receivedAt: new Date('2024-01-14T12:00:00Z'),
      expectedCategory: 'personal',
      expectedIsNewsletter: false,
      expectedTodos: 1,
      expectedPriority: 'medium'
    }
  ],

  // Finance emails
  finance: [
    {
      id: 'finance-1',
      subject: 'Your Credit Card Statement is Ready',
      sender: 'statements@chase.com',
      body: `
        Your January credit card statement is now available online.
        
        Statement Summary:
        - Previous balance: $1,245.67
        - Payments: $1,245.67
        - New charges: $892.43
        - Minimum payment due: $35.00
        - Payment due date: February 15, 2024
        
        Please review your statement and make payment by the due date.
      `,
      receivedAt: new Date('2024-01-20T06:00:00Z'),
      expectedCategory: 'finance',
      expectedIsNewsletter: false,
      expectedTodos: 2,
      expectedPriority: 'medium'
    }
  ],

  // Shopping emails
  shopping: [
    {
      id: 'shopping-1',
      subject: 'Your Amazon Order Has Shipped!',
      sender: 'ship-confirm@amazon.com',
      body: `
        Great news! Your order has shipped.
        
        Order #: 123-4567890-1234567
        Tracking number: 1Z999AA1234567890
        Expected delivery: January 18, 2024
        
        Track your package: https://amazon.com/track/1Z999AA1234567890
        
        Items in this shipment:
        - Wireless Headphones (Black) - $99.99
      `,
      receivedAt: new Date('2024-01-16T14:00:00Z'),
      expectedCategory: 'shopping',
      expectedIsNewsletter: false,
      expectedTodos: 0
    }
  ],

  // Promotional emails
  promotional: [
    {
      id: 'promo-1',
      subject: '50% Off Everything - Limited Time Only!',
      sender: 'sales@retailstore.com',
      body: `
        🔥 FLASH SALE ALERT! 🔥
        
        50% OFF EVERYTHING in our store!
        Use code: SAVE50
        
        ⏰ Sale ends at midnight tonight!
        
        Shop now: https://retailstore.com/sale
        
        Don't miss out on these amazing deals!
      `,
      receivedAt: new Date('2024-01-15T16:00:00Z'),
      expectedCategory: 'promotional',
      expectedIsNewsletter: false,
      expectedTodos: 0
    }
  ],

  // Support emails
  support: [
    {
      id: 'support-1',
      subject: 'Re: Support Ticket #12345 - Login Issues',
      sender: 'support@service.com',
      body: `
        Hi John,
        
        Thank you for contacting support regarding login issues.
        
        We've identified the problem and implemented a fix. Please try the following:
        
        1. Clear your browser cache and cookies
        2. Try logging in with a private/incognito window
        3. Reset your password if the above doesn't work
        
        If you continue to experience issues, please reply to this email.
        
        Best regards,
        Support Team
      `,
      receivedAt: new Date('2024-01-13T11:00:00Z'),
      expectedCategory: 'support',
      expectedIsNewsletter: false,
      expectedTodos: 3,
      expectedPriority: 'medium'
    }
  ],

  // Travel emails
  travel: [
    {
      id: 'travel-1',
      subject: 'Flight Confirmation - NYC to LAX',
      sender: 'confirmations@airline.com',
      body: `
        Your flight is confirmed!
        
        Confirmation Code: ABC123
        Flight: AA1234
        Date: February 1, 2024
        Departure: 8:00 AM EST (JFK) 
        Arrival: 11:30 AM PST (LAX)
        
        Please arrive at the airport 2 hours before departure.
        Check-in opens 24 hours before your flight.
        
        Have a great trip!
      `,
      receivedAt: new Date('2024-01-18T19:00:00Z'),
      expectedCategory: 'travel',
      expectedIsNewsletter: false,
      expectedTodos: 2,
      expectedPriority: 'medium'
    }
  ],

  // Social emails
  social: [
    {
      id: 'social-1',
      subject: 'John Doe liked your photo',
      sender: 'notifications@instagram.com',
      body: `
        John Doe liked your photo.
        
        "Beautiful sunset at the beach! 🌅"
        
        View on Instagram: https://instagram.com/p/abc123
        
        To stop receiving these notifications, update your preferences.
      `,
      receivedAt: new Date('2024-01-17T20:30:00Z'),
      expectedCategory: 'social',
      expectedIsNewsletter: false,
      expectedTodos: 0
    }
  ],

  // Complex work email with multiple todos and priorities
  complexWork: [
    {
      id: 'complex-1',
      subject: 'Project Alpha: Critical Issues and Next Steps',
      sender: 'pm@company.com',
      body: `
        Team,
        
        Following our emergency meeting, here's what needs immediate attention:
        
        URGENT (by EOD today):
        - Fix the authentication bug in production
        - Deploy the hotfix to staging first
        - Run full regression tests
        
        HIGH PRIORITY (by Friday):
        - Complete the security audit report
        - Update documentation for new API endpoints  
        - Schedule client demo for next week
        
        MEDIUM PRIORITY:
        - Refactor the user service code
        - Update unit tests for better coverage
        
        Please confirm receipt and your assignments.
        
        Thanks,
        Product Manager
      `,
      receivedAt: new Date('2024-01-11T14:45:00Z'),
      expectedCategory: 'work',
      expectedIsNewsletter: false,
      expectedTodos: 8,
      expectedPriority: 'urgent'
    }
  ],

  // Mixed category email (newsletter with some actionable content)
  mixed: [
    {
      id: 'mixed-1',
      subject: 'Company Newsletter - January 2024',
      sender: 'newsletter@company.com',
      body: `
        Welcome to our monthly company newsletter!
        
        🎉 Company Updates:
        - We hit 1M users this month!
        - New office opening in Austin
        - Q4 results exceeded expectations
        
        📅 Upcoming Events:
        - All-hands meeting: January 25th at 2 PM
        - Team building event: February 5th
        
        📋 Action Items for All Staff:
        - Please update your emergency contact information in HR system
        - Complete mandatory security training by month-end
        
        Thanks for reading!
        
        Unsubscribe | Update preferences
      `,
      receivedAt: new Date('2024-01-19T10:00:00Z'),
      expectedCategory: 'newsletter',
      expectedIsNewsletter: true,
      expectedTodos: 2,
      expectedPriority: 'medium'
    }
  ]
};

// Helper function to get all test emails as a flat array
export function getAllTestEmails() {
  const allEmails = [];
  for (const category in testEmails) {
    if (Array.isArray(testEmails[category as keyof typeof testEmails])) {
      allEmails.push(...testEmails[category as keyof typeof testEmails]);
    }
  }
  return allEmails;
}

// Helper function to get emails by category
export function getEmailsByCategory(category: keyof typeof testEmails) {
  return testEmails[category] || [];
}

// Helper function to create email processing input format
export function toProcessingInput(email: typeof testEmails.newsletter[0]) {
  return {
    id: email.id,
    subject: email.subject,
    body: email.body,
    sender: email.sender,
    receivedAt: email.receivedAt
  };
}

// Test cases for edge cases
export const edgeCaseEmails = {
  emptySubject: {
    id: 'edge-1',
    subject: '',
    sender: 'test@example.com',
    body: 'This email has no subject line.',
    receivedAt: new Date(),
    expectedCategory: 'other',
    expectedIsNewsletter: false,
    expectedTodos: 0
  },
  
  veryLongEmail: {
    id: 'edge-2', 
    subject: 'Very Long Email for Testing',
    sender: 'test@example.com',
    body: 'Lorem ipsum '.repeat(1000), // Very long content
    receivedAt: new Date(),
    expectedCategory: 'other',
    expectedIsNewsletter: false,
    expectedTodos: 0
  },
  
  specialCharacters: {
    id: 'edge-3',
    subject: 'Email with Special Characters: 中文 🚀 #hashtag @mention',
    sender: 'unicode@example.com',
    body: 'This email contains special characters: 中文内容, emojis 🎉🎊, and symbols @#$%',
    receivedAt: new Date(),
    expectedCategory: 'other',
    expectedIsNewsletter: false,
    expectedTodos: 0
  },
  
  suspiciousEmail: {
    id: 'edge-4',
    subject: 'CONGRATULATIONS! You won $1,000,000!!!',
    sender: 'noreply@suspicious-domain.com',
    body: `
      CONGRATULATIONS! 
      
      You have been selected to receive $1,000,000 USD!
      
      Click here immediately to claim your prize!
      Act now before this limited time offer expires!
      
      Send your banking details to claim your winnings.
    `,
    receivedAt: new Date(),
    expectedCategory: 'spam',
    expectedIsNewsletter: false,
    expectedTodos: 0
  }
};