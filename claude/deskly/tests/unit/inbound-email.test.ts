import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normaliseSubject,
  parseAddress,
  parseInboundEmail,
  subdomainFromRecipient,
  ticketIdFromMessageId,
  ticketNumberFromSubject,
} from "../../src/lib/email/inbound";
import { stripQuotedReply } from "../../src/lib/sanitize";

describe("parseAddress", () => {
  it("splits a display name from the address", () => {
    assert.deepEqual(parseAddress('"Jane Doe" <jane@example.com>'), {
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("handles an unquoted display name", () => {
    assert.deepEqual(parseAddress("Jane Doe <jane@example.com>"), {
      email: "jane@example.com",
      name: "Jane Doe",
    });
  });

  it("handles a bare address", () => {
    assert.deepEqual(parseAddress("jane@example.com"), {
      email: "jane@example.com",
      name: null,
    });
  });

  it("lowercases the address", () => {
    assert.equal(parseAddress("Jane@Example.COM").email, "jane@example.com");
  });
});

describe("parseInboundEmail", () => {
  it("parses a Postmark payload", () => {
    const parsed = parseInboundEmail({
      From: "jane@example.com",
      FromFull: { Email: "Jane@Example.com", Name: "Jane Doe" },
      ToFull: [{ Email: "support@acme.deskly.local" }],
      Subject: "Re: Broken widget",
      TextBody: "Still broken",
      HtmlBody: "<p>Still broken</p>",
      Headers: [
        { Name: "Message-ID", Value: "<abc@example.com>" },
        { Name: "In-Reply-To", Value: "<xyz.tid@deskly.local>" },
        { Name: "References", Value: "<one@a> <xyz.tid@deskly.local>" },
      ],
      Attachments: [{ Name: "log.txt", Content: "aGk=", ContentType: "text/plain" }],
    });

    assert.ok(parsed);
    assert.equal(parsed.from, "jane@example.com");
    assert.equal(parsed.fromName, "Jane Doe");
    assert.deepEqual(parsed.to, ["support@acme.deskly.local"]);
    assert.equal(parsed.messageId, "<abc@example.com>");
    assert.equal(parsed.inReplyTo, "<xyz.tid@deskly.local>");
    assert.deepEqual(parsed.references, ["<one@a>", "<xyz.tid@deskly.local>"]);
    assert.equal(parsed.attachments.length, 1);
    assert.equal(parsed.attachments[0].filename, "log.txt");
  });

  it("parses a SendGrid Inbound Parse payload", () => {
    const parsed = parseInboundEmail({
      from: "Jane Doe <jane@example.com>",
      to: "support@acme.deskly.local",
      subject: "Help",
      text: "Please help",
      headers:
        "Message-Id: <sg-1@example.com>\nIn-Reply-To: <prev@deskly.local>\nReferences: <prev@deskly.local>",
    });

    assert.ok(parsed);
    assert.equal(parsed.from, "jane@example.com");
    assert.equal(parsed.messageId, "<sg-1@example.com>");
    assert.equal(parsed.inReplyTo, "<prev@deskly.local>");
  });

  it("parses a generic/Resend payload with an object sender", () => {
    const parsed = parseInboundEmail({
      from: { email: "Jane@Example.com", name: "Jane" },
      to: ["support@acme.deskly.local"],
      subject: "Hello",
      text: "Hi",
      messageId: "<gen-1@example.com>",
      inReplyTo: "<prev@deskly.local>",
      references: ["<prev@deskly.local>"],
    });

    assert.ok(parsed);
    assert.equal(parsed.from, "jane@example.com");
    assert.equal(parsed.fromName, "Jane");
    assert.deepEqual(parsed.references, ["<prev@deskly.local>"]);
  });

  it("returns null for an unrecognised payload", () => {
    assert.equal(parseInboundEmail({ nonsense: true }), null);
    assert.equal(parseInboundEmail(null), null);
  });
});

describe("subdomainFromRecipient", () => {
  it("reads the subdomain from the host", () => {
    assert.equal(
      subdomainFromRecipient(["support@acme.deskly.local"], "deskly.local"),
      "acme",
    );
  });

  it("supports plus-addressing on the bare domain", () => {
    assert.equal(
      subdomainFromRecipient(["support+acme@deskly.local"], "deskly.local"),
      "acme",
    );
  });

  it("ignores unrelated recipients and picks the matching one", () => {
    assert.equal(
      subdomainFromRecipient(
        ["someone@elsewhere.com", "support@acme.deskly.local"],
        "deskly.local",
      ),
      "acme",
    );
  });

  it("rejects a deeper host that is not a single subdomain", () => {
    assert.equal(
      subdomainFromRecipient(["support@a.b.deskly.local"], "deskly.local"),
      null,
    );
  });

  it("returns null when nothing matches", () => {
    assert.equal(subdomainFromRecipient(["support@other.com"], "deskly.local"), null);
    assert.equal(subdomainFromRecipient([], "deskly.local"), null);
  });
});

describe("ticketIdFromMessageId", () => {
  it("recovers the ticket id we embedded on the way out", () => {
    assert.equal(
      ticketIdFromMessageId("<msg123.ticket456@deskly.local>", "deskly.local"),
      "ticket456",
    );
  });

  it("ignores a Message-ID from another domain", () => {
    assert.equal(
      ticketIdFromMessageId("<msg123.ticket456@gmail.com>", "deskly.local"),
      null,
    );
  });

  it("handles null", () => {
    assert.equal(ticketIdFromMessageId(null, "deskly.local"), null);
  });
});

describe("normaliseSubject", () => {
  it("strips stacked reply and forward prefixes", () => {
    assert.equal(normaliseSubject("Re: Fwd: Re: Broken widget"), "Broken widget");
    assert.equal(normaliseSubject("RE: Broken widget"), "Broken widget");
    assert.equal(normaliseSubject("Broken widget"), "Broken widget");
  });
});

describe("ticketNumberFromSubject", () => {
  it("finds a bracketed ticket number", () => {
    assert.equal(ticketNumberFromSubject("[#42] Broken widget"), 42);
  });

  it("finds a bare hash number", () => {
    assert.equal(ticketNumberFromSubject("Re: ticket #7 update"), 7);
  });

  it("returns null when absent", () => {
    assert.equal(ticketNumberFromSubject("No number here"), null);
  });
});

describe("stripQuotedReply", () => {
  it("removes an On-wrote quoted block", () => {
    const text = "Thanks, that worked!\n\nOn Mon, 4 Aug 2026 at 10:00, Support wrote:\n> Have you tried…";
    assert.equal(stripQuotedReply(text), "Thanks, that worked!");
  });

  it("removes an Outlook-style original message block", () => {
    const text = "Any update?\n\n-----Original Message-----\nFrom: Support";
    assert.equal(stripQuotedReply(text), "Any update?");
  });

  it("leaves an unquoted message alone", () => {
    assert.equal(stripQuotedReply("Just a plain message"), "Just a plain message");
  });

  it("keeps the original when stripping would empty it", () => {
    const text = "> quoted only";
    assert.equal(stripQuotedReply(text), "> quoted only");
  });
});
