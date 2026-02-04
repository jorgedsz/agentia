-- CreateTable
CREATE TABLE "TwilioCredentials" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "accountSid" TEXT NOT NULL,
    "authToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TwilioCredentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phoneNumber" TEXT NOT NULL,
    "friendlyName" TEXT,
    "twilioSid" TEXT NOT NULL,
    "vapiPhoneNumberId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "twilioCredentialsId" INTEGER NOT NULL,
    "agentId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PhoneNumber_twilioCredentialsId_fkey" FOREIGN KEY ("twilioCredentialsId") REFERENCES "TwilioCredentials" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PhoneNumber_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TwilioCredentials_userId_key" ON "TwilioCredentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_twilioSid_key" ON "PhoneNumber"("twilioSid");
