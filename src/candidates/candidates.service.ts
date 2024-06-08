import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { PrismaService } from 'nestjs-prisma';
import { Approval, Candidate } from '@prisma/client';
import { ApprovalCandidateDto } from './dto/approval-candidate.dto';
import * as bcrypt from 'bcrypt';

import { sendMail } from '../common/config/mailer.config';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class CandidatesService {
  private transporter: nodemailer.Transporter;
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.transporter = sendMail(this.config);
  }
  // constructor(private readonly prisma: PrismaService) {}

  async createCandidate(createCandidateDto: CreateCandidateDto, userId: string): Promise<Candidate> {
    const existingCandidate = await this.prisma.candidate.findFirst({
      where: {
        user_id: userId,
      },
    });

    const { lk1, lk2, sc, keaktifan } = createCandidateDto;
    const rerata = (lk1 + lk2 + sc + keaktifan) / 4;
    const candidateData = { ...createCandidateDto, rerata, user_id: userId };

    console.log(candidateData)


    if (existingCandidate) {
      const updatedCandidate = await this.prisma.candidate.update({
        where: {
          id: existingCandidate.id,
        },
        data: candidateData,
      });

      const datas = await this.prisma.candidate.findFirst({
        where: {
          user_id: userId,
        },
      });

      return datas
    } else {
      const newCandidate = await this.prisma.candidate.create({
        data: candidateData,
      });
      return newCandidate;
    }
  }


  async getCandidateById(id: string): Promise<Candidate> {
    try {
      const candidate = await this.prisma.candidate.findFirst({
        where: {
          user_id: id,
        }
      });
      if (!candidate) {
        throw new NotFoundException('Candidate not found');
      }
      return candidate;
    } catch (error) {
      throw new Error(`Failed to fetch candidate: ${error.message}`);
    }
  }

  async getAllCandidate(): Promise<any[]> {
    try {
      const candidates = await this.prisma.candidate.findMany({
        include: {
          user: true,
        },
      });
      return candidates.map((candidate) => ({
        id: candidate.id,
        user_id: candidate.user_id,
        lk1: candidate.lk1,
        lk2: candidate.lk2,
        sc: candidate.sc,
        keaktifan: candidate.keaktifan,
        rerata: candidate.rerata,
        approval: candidate.approval,
        description: candidate.description,
      }));
    } catch (error) {
      console.error(error);
      throw new Error('Error fetching candidate list');
    }
  }

  async decisionCandidate(approvalCandidateDto: ApprovalCandidateDto, userId: string): Promise<Candidate> {
    try {
      if (approvalCandidateDto.approval === Approval.Accepted) {
        const existingCandidate = await this.prisma.candidate.findFirst({
          where: {
            user_id: userId,
          },
        });
    
        // Update tables users
        // NRA
        const nraData = await this.prisma.users.findMany({ select: { nra: true } });
        
        const maxNRA = nraData.reduce((max, current) => {
          if (current.nra) {
            const nraParts = current.nra.split('/');
            if (nraParts.length > 0) {
              const currentNRA = parseInt(nraParts[0]);
              if (!isNaN(currentNRA) && currentNRA > max) {
                max = currentNRA;
              }
            }
          }
          return max;
        }, 0);
        
    
        const nraLatest = maxNRA+1
        const now = new Date();
        const currentYear = now.getFullYear().toString();
    
        const nranow = nraLatest.toString() + '/UKM_IK/XVIII/' + currentYear
    
        // Role (Anggota)
        const role = 6
    
        // Username
        const users = await this.prisma.users.findFirst({ where: { id: userId } });
        if (!users.username) {
          let words = users.nama.split(' ');
          let abbreviatedName = '';
          if (words.length === 1) {
            abbreviatedName = users.nama.toLowerCase();
          } else {
            for (let i = 0; i < words.length - 1; i++) {
              abbreviatedName += words[i].charAt(0);
            }
            abbreviatedName += words[words.length - 1];
            abbreviatedName = abbreviatedName.toLowerCase();
          }
          users.username = abbreviatedName;
    
          let validateUsername = await this.prisma.users.findFirst({
            where: {
              username: users.username
            }
          });
          if (validateUsername) {
            const usernameRandom = Math.floor(Math.random() * 1000);
            users.username = users.username + usernameRandom;
          }
        }
    
        // Password
        const password = users.id.substr(0, 8);
        const hashedPassword = await bcrypt.hash(password, 10);
        users.password = hashedPassword;
    
        users.nra = nranow
        users.role_id = role
    
        const updateUsers = await this.prisma.users.update({
          where: {
            id: userId
          },
          data: users
        })
  
        const updateCandidte = await this.prisma.candidate.findFirst({
          where: {
              user_id: userId,
          },
        });
        await this.prisma.candidate.update({
          where: {
            id: updateCandidte.id,
          },
          data: {
            approval : Approval.Accepted,
            description: approvalCandidateDto.description
          }
        })
    
        await this.sendAcceptedEmail(userId,password);
        return
      } else {
        const updateCandidte = await this.prisma.candidate.findFirst({
          where: {
              user_id: userId,
          },
        });
        await this.prisma.candidate.update({
          where: {
            id: updateCandidte.id,
          },
          data: {
            approval : Approval.Rejected,
            description: approvalCandidateDto.description
          }
        })
        await this.prisma.users.update({
          where: {
            id: userId,
          },
          data: {
            status: "Inactive",
          }
        })
        await this.sendRejectedEmail(userId);
      }
    } catch (error) {
      throw new Error(`Failed to process candidate approval: ${error.message}`);
    }
  }

  async sendAcceptedEmail(userId: string, password:string): Promise<void> {
    try {
        const user = await this.prisma.users.findUnique({
          where: { id: userId },
          select: {
              email: true,
              nra: true,
              nama: true,
              role: { select: { name: true } },
              username: true,
              password: true
            }
        });

        console.log("user email : ",user)
        const passwordEmail = process.env.password_email;
        console.log("password_dari env : ",passwordEmail)

        if (!user) {
          throw new Error('User not found');
        }
        const mailOptions = {
          from: 'ukmik@utdi.ac.id',
          to: user.email,
          subject: 'Congratulations! Your Application Has Been Approved',
          
          text: `Dear ${user.nama},\n\n` +
              `Congratulations! Your application has been approved.\n\n` +
              `NRA: ${user.nra}\n` +
              `Name: ${user.nama}\n` +
              `Role: ${user.role.name}\n` +
              `Username: ${user.username}\n` +
              `Password: ${password}\n\n` +
              `Please use the above credentials to log in and access your account.\n\n` +
              `Regards,\nUKM IK Student Committee`
        };
        await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw new Error(`Failed to send email: ${error.message}`);
    }
  }

  async sendRejectedEmail(userId: string): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        nama: true,
        email: true,
        }
      });
      if (!user) {
        throw new Error('User not found');
      }
      const mailOptions = {
        from: 'ukmik@utdi.ac.id',
        to: user.email,
        subject: 'Important Update: Your Application Has Been Rejected ',
        text: `Dear ${user.nama},\n\n`+
        `We regret to inform you that your application has been rejected.\n\nThank you for your interest.\n\n`+
        `Regards,\nUKM IK Student Committee`,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
